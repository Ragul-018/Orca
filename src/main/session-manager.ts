import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { ActiveSession, LaunchResult, PlaySession } from '@shared/types'
import type { DataStore, StoredActiveSession } from './data-store'
import { getProcessImagePath, listProcesses, processNameMatches } from './processes-win32'
import { encodePowerShell, parseArguments, runPowerShell, spawnGame } from './windows-utils'

const TICK_MS = 2_000
const END_GRACE_MS = 9_000
const PERSIST_INTERVAL_MS = 15_000
const EXTERNAL_SCAN_EVERY_TICKS = 2
const IGNORE_PID_MS = 10 * 60_000

interface InternalSession extends StoredActiveSession {
  baselinePids: Set<number>
  trackedSet: Set<number>
  lastPersistedAt: number
}

function samePath(a: string | null, b: string): boolean {
  if (!a) return false
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

export class SessionManager extends EventEmitter {
  private active: InternalSession | null = null
  private readonly timer: NodeJS.Timeout
  private ignoredPids = new Map<number, number>()
  private suppressedGames = new Map<string, number>()
  private tickCount = 0
  private stopping = false

  constructor(private readonly store: DataStore) {
    super()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.timer.unref()
  }

  async recoverPersistedSession(): Promise<void> {
    const persisted = this.store.getPersistedSession()
    if (!persisted) return
    const game = this.store.getGameRecord(persisted.gameId)
    const durationMs = Math.max(0, Date.parse(persisted.lastSeenAt) - Date.parse(persisted.startedAt))

    if (game && durationMs >= 1_000) {
      const session: PlaySession = {
        id: persisted.id,
        gameId: persisted.gameId,
        startedAt: persisted.startedAt,
        endedAt: persisted.lastSeenAt,
        durationMs,
        source: persisted.source,
        endReason: 'recovered'
      }
      try {
        await this.store.addSession(session)
        this.emit('ended', session)
        this.emit('libraryChanged')
        return
      } catch {
        // Fall through and clear the stale active session.
      }
    }

    await this.store.setActiveSession(null).catch(() => undefined)
  }

  getActiveSession(): ActiveSession | null {
    if (!this.active) return null
    return {
      id: this.active.id,
      gameId: this.active.gameId,
      startedAt: this.active.startedAt,
      elapsedMs: Math.max(0, Date.now() - Date.parse(this.active.startedAt)),
      processName: this.active.watchName,
      source: this.active.source
    }
  }

  async launch(gameId: string): Promise<LaunchResult> {
    if (this.active) {
      return { ok: false, error: 'A game is already being tracked. Stop it before launching another.' }
    }

    const game = this.store.getGameRecord(gameId)
    if (!game) return { ok: false, error: 'Game not found.' }

    const wantedProcess = path.basename(game.watchProcess || game.executablePath).toLowerCase()
    const baselinePids = new Set(
      listProcesses(true)
        .filter((process) => processNameMatches(process.name, wantedProcess))
        .map((process) => process.pid)
    )

    try {
      const args = parseArguments(game.launchArguments)
      const workingDirectory = game.workingDirectory || path.dirname(game.executablePath)
      const spawned = await spawnGame(game.executablePath, args, workingDirectory, game.runAsAdmin)
      await this.beginSession({
        gameId,
        rootPid: spawned.pid,
        watchedName: wantedProcess,
        source: 'launcher',
        baselinePids
      })

      return { ok: true, activeSession: this.getActiveSession() ?? undefined }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'The game could not be launched.' }
    }
  }

  async stopActiveSession(): Promise<void> {
    if (!this.active || this.stopping) return
    this.stopping = true
    const active = this.active
    const rootPid = active.rootPid
    const trackedPids = [...active.trackedSet]

    // Ignore the stopped process tree and keep the external scanner from
    // re-attaching to a game that is still shutting down (or auto-restarting).
    for (const pid of trackedPids) {
      this.ignoredPids.set(pid, Date.now() + IGNORE_PID_MS)
    }
    this.suppressedGames.set(active.gameId, Date.now() + 12_000)

    try {
      await terminateGame(rootPid, trackedPids)
    } catch {
      // Best-effort termination
    } finally {
      await this.finalize('stopped')
      this.stopping = false
    }
  }

  async persistActiveSession(): Promise<void> {
    if (!this.active) return
    try {
      await this.store.setActiveSession(this.toStored(this.active))
      this.active.lastPersistedAt = Date.now()
    } catch {
      // The in-memory session remains usable even if the disk write failed.
    }
  }

  dispose(): void {
    clearInterval(this.timer)
  }

  private async beginSession(options: {
    gameId: string
    rootPid: number
    watchedName: string
    source: 'launcher' | 'external'
    baselinePids?: Set<number>
  }): Promise<void> {
    const now = new Date()
    const stored: StoredActiveSession = {
      id: randomUUID(),
      gameId: options.gameId,
      startedAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      source: options.source,
      rootPid: options.rootPid,
      watchName: options.watchedName,
      trackedPids: [options.rootPid]
    }

    this.active = {
      ...stored,
      baselinePids: options.baselinePids ?? new Set(),
      trackedSet: new Set([options.rootPid]),
      lastPersistedAt: 0
    }

    try {
      await this.store.setActiveSession(this.toStored(this.active))
      this.active.lastPersistedAt = Date.now()
    } catch {
      // Still start tracking even if persistence is unavailable.
    }

    const game = this.store.getGameRecord(options.gameId)
    if (game?.status === 'unplayed') {
      try {
        await this.store.updateGame({ id: options.gameId, status: 'playing' })
      } catch {
        // Status is a convenience and should not block tracking.
      }
    }

    this.emit('session', this.getActiveSession())
    this.emit('libraryChanged')
  }

  private tick(): void {
    this.tickCount += 1

    if (!this.active) {
      if (this.store.getSettings().trackExternalGames && this.tickCount % EXTERNAL_SCAN_EVERY_TICKS === 0) {
        void this.scanForExternalGames()
      }
      return
    }

    let processes
    try {
      processes = listProcesses(true)
    } catch {
      return
    }

    const alive = new Set(processes.map((process) => process.pid))
    const lineage = this.active.trackedSet

    if (this.active.watchName) {
      for (const process of processes) {
        if (!this.active.baselinePids.has(process.pid) && processNameMatches(process.name, this.active.watchName)) {
          lineage.add(process.pid)
        }
      }
    }

    let changed = true
    let passes = 0
    while (changed && passes < 8) {
      changed = false
      passes += 1
      for (const process of processes) {
        if (lineage.has(process.parentPid) && !lineage.has(process.pid)) {
          lineage.add(process.pid)
          changed = true
        }
      }
    }

    const anyAlive = [...lineage].some((pid) => alive.has(pid))
    if (anyAlive) {
      this.active.lastSeenAt = new Date().toISOString()
      this.active.trackedPids = [...lineage]
      this.emit('session', this.getActiveSession())

      if (Date.now() - this.active.lastPersistedAt >= PERSIST_INTERVAL_MS) {
        void this.persistActiveSession()
      }
      return
    }

    this.emit('session', this.getActiveSession())

    const silenceMs = Date.now() - Date.parse(this.active.lastSeenAt)
    if (silenceMs >= END_GRACE_MS) {
      void this.finalize('exited')
    }
  }

  private async scanForExternalGames(): Promise<void> {
    if (this.active) return
    const games = this.store.getGames()
    if (games.length === 0) return

    let processes
    try {
      processes = listProcesses(true)
    } catch {
      return
    }

    const byName = new Map<string, typeof games>()
    for (const game of games) {
      if (!game.executablePath.toLowerCase().endsWith('.exe')) continue
      const name = path.basename(game.executablePath).toLowerCase()
      const list = byName.get(name) ?? []
      list.push(game)
      byName.set(name, list)
    }

    for (const process of processes) {
      const gamesWithName = byName.get(process.name.toLowerCase())
      if (!gamesWithName || !gamesWithName.length) continue
      const ignoredUntil = this.ignoredPids.get(process.pid)
      if (ignoredUntil && ignoredUntil > Date.now()) continue
      const imagePath = getProcessImagePath(process.pid)
      if (!imagePath) continue
      const game = gamesWithName.find((candidate) => samePath(imagePath, candidate.executablePath))
      if (!game) continue
      const suppressedUntil = this.suppressedGames.get(game.id)
      if (suppressedUntil && suppressedUntil > Date.now()) continue

      await this.beginSession({
        gameId: game.id,
        rootPid: process.pid,
        watchedName: process.name.toLowerCase(),
        source: 'external',
        baselinePids: new Set()
      })
      return
    }
  }

  private async finalize(reason: PlaySession['endReason']): Promise<void> {
    const active = this.active
    if (!active) return
    this.active = null

    for (const pid of active.trackedSet) {
      this.ignoredPids.set(pid, Date.now() + IGNORE_PID_MS)
    }

    const endedAt = reason === 'exited' ? active.lastSeenAt : new Date().toISOString()
    const durationMs = Math.max(0, Date.parse(endedAt) - Date.parse(active.startedAt))
    const session: PlaySession = {
      id: active.id,
      gameId: active.gameId,
      startedAt: active.startedAt,
      endedAt,
      durationMs,
      source: active.source,
      endReason: reason
    }

    try {
      if (durationMs >= 1_000) {
        await this.store.addSession(session)
      } else {
        await this.store.setActiveSession(null)
      }
    } catch {
      // A failed write should not leave the launcher stuck in a "running" state.
    }

    this.emit('session', null)
    if (durationMs >= 1_000) this.emit('ended', session)
    this.emit('libraryChanged')
  }

  private toStored(session: InternalSession): StoredActiveSession {
    return {
      id: session.id,
      gameId: session.gameId,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      source: session.source,
      rootPid: session.rootPid,
      watchName: session.watchName,
      trackedPids: [...session.trackedSet]
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runTaskkill(args: string[]): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn('taskkill.exe', args, {
      windowsHide: true,
      stdio: 'ignore'
    })
    const timeout = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // Ignore
      }
      resolve(false)
    }, 2_000)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      resolve(code === 0)
    })
    child.once('error', () => {
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

function isProcessAlive(pid: number): boolean {
  try {
    return listProcesses(true).some((proc) => proc.pid === pid)
  } catch {
    return false
  }
}

function alivePids(pids: number[]): number[] {
  try {
    const target = new Set(pids)
    return listProcesses(true)
      .filter((proc) => target.has(proc.pid))
      .map((proc) => proc.pid)
  } catch {
    return []
  }
}

async function terminateGame(rootPid: number, trackedPids: number[]): Promise<void> {
  const allPids = Array.from(new Set([rootPid, ...trackedPids])).filter(
    (pid) => Number.isInteger(pid) && pid > 0
  )
  if (allPids.length === 0) return

  // Only ever target PIDs that belong to this tracked session. Never use
  // `/IM <name>`: that would also kill unrelated processes that happen to
  // share an executable name (for example another cmd.exe or Unity game).
  if (allPids.includes(rootPid) && isProcessAlive(rootPid)) {
    await runTaskkill(['/PID', String(rootPid), '/T', '/F'])
  }

  // Children can outlive the root, so kill any remaining tracked PIDs
  // individually rather than falling back to a name match.
  for (const pid of alivePids(allPids)) {
    if (pid === rootPid) continue
    await runTaskkill(['/PID', String(pid), '/T', '/F'])
  }

  await sleep(250)

  const survivors = alivePids(allPids)
  if (survivors.length === 0) return

  // One last attempt for games running elevated. This is the only elevation
  // prompt the launcher ever raises for a stop request; if it is cancelled,
  // we give up instead of prompting again.
  try {
    const innerScript = `Stop-Process -Id ${survivors.join(',')} -Force -ErrorAction SilentlyContinue`
    const encoded = encodePowerShell(innerScript)
    const script = [
      `Start-Process -FilePath 'powershell.exe'`,
      `-ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand','${encoded}')`,
      `-Verb RunAs -WindowStyle Hidden -Wait`
    ].join(' ')
    await runPowerShell(script, 12_000)
  } catch {
    // User cancelled elevation or it timed out. Do not prompt again.
  }

  await sleep(150)
}

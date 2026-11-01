import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  AddGameInput,
  AppSnapshot,
  Game,
  GameStatus,
  PlaySession,
  Settings,
  UpdateGameInput,
  UpdateSettingsInput
} from '@shared/types'
import { DEFAULT_SETTINGS, GAME_STATUSES } from '@shared/types'
import { SCHEMA_VERSION } from '@shared/constants'

interface StoredGame {
  id: string
  title: string
  executablePath: string
  launchArguments: string
  workingDirectory: string
  runAsAdmin: boolean
  watchProcess: string
  coverArt: string | null
  heroArt: string | null
  description: string
  developer: string
  releaseYear: string
  genres: string[]
  tags: string[]
  notes: string
  favorite: boolean
  hidden: boolean
  status: GameStatus
  rating: number | null
  addedAt: string
  updatedAt: string
}

export interface StoredActiveSession {
  id: string
  gameId: string
  startedAt: string
  lastSeenAt: string
  source: 'launcher' | 'external'
  rootPid: number
  watchName: string
  trackedPids: number[]
}

interface StoredData {
  schemaVersion: number
  games: StoredGame[]
  sessions: PlaySession[]
  settings: Settings
  activeSession: StoredActiveSession | null
  createdAt: string
  updatedAt: string
}

const ART_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'])

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))]
}

function cleanStatus(value: unknown, fallback: GameStatus = 'unplayed'): GameStatus {
  return GAME_STATUSES.includes(value as GameStatus) ? (value as GameStatus) : fallback
}

function cleanRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(5, Math.round(value)))
}

function newData(): StoredData {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    games: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
    activeSession: null,
    createdAt: now,
    updatedAt: now
  }
}

function normalizeData(input: unknown): StoredData {
  const fallback = newData()
  if (!input || typeof input !== 'object') return fallback
  const source = input as Record<string, unknown>
  const games = Array.isArray(source.games)
    ? source.games
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => {
          const now = new Date().toISOString()
          return {
            id: cleanString(item.id) || randomUUID(),
            title: cleanString(item.title, 'Untitled game') || 'Untitled game',
            executablePath: cleanString(item.executablePath),
            launchArguments: cleanString(item.launchArguments),
            workingDirectory: cleanString(item.workingDirectory),
            runAsAdmin: Boolean(item.runAsAdmin),
            watchProcess: cleanString(item.watchProcess),
            coverArt: cleanString(item.coverArt) || null,
            heroArt: cleanString(item.heroArt) || null,
            description: cleanString(item.description),
            developer: cleanString(item.developer),
            releaseYear: cleanString(item.releaseYear).slice(0, 4),
            genres: cleanStringArray(item.genres),
            tags: cleanStringArray(item.tags),
            notes: cleanString(item.notes),
            favorite: Boolean(item.favorite),
            hidden: Boolean(item.hidden),
            status: cleanStatus(item.status),
            rating: cleanRating(item.rating),
            addedAt: cleanString(item.addedAt, now) || now,
            updatedAt: cleanString(item.updatedAt, now) || now
          } satisfies StoredGame
        })
    : []

  const sessions = Array.isArray(source.sessions)
    ? source.sessions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => {
          const endedAt = cleanString(item.endedAt)
          return {
            id: cleanString(item.id) || randomUUID(),
            gameId: cleanString(item.gameId),
            startedAt: cleanString(item.startedAt),
            endedAt,
            durationMs: Math.max(0, Number(item.durationMs) || 0),
            source: item.source === 'external' ? 'external' : 'launcher',
            endReason: ['exited', 'stopped', 'recovered'].includes(String(item.endReason))
              ? (item.endReason as PlaySession['endReason'])
              : 'exited'
          } satisfies PlaySession
        })
        .filter((session) => session.gameId && session.startedAt)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    : []

  const validGameIds = new Set(games.map((game) => game.id))
  const filteredSessions = sessions.filter((session) => validGameIds.has(session.gameId))

  let settings = { ...DEFAULT_SETTINGS }
  if (source.settings && typeof source.settings === 'object') {
    settings = { ...settings, ...(source.settings as Partial<Settings>) }
  }

  let activeSession: StoredActiveSession | null = null
  if (source.activeSession && typeof source.activeSession === 'object') {
    const active = source.activeSession as Record<string, unknown>
    const gameId = cleanString(active.gameId)
    if (gameId && validGameIds.has(gameId)) {
      activeSession = {
        id: cleanString(active.id) || randomUUID(),
        gameId,
        startedAt: cleanString(active.startedAt, new Date().toISOString()),
        lastSeenAt: cleanString(active.lastSeenAt, new Date().toISOString()),
        source: active.source === 'external' ? 'external' : 'launcher',
        rootPid: Number(active.rootPid) || 0,
        watchName: cleanString(active.watchName),
        trackedPids: Array.isArray(active.trackedPids)
          ? active.trackedPids.map(Number).filter((pid) => Number.isInteger(pid) && pid > 0)
          : []
      }
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    games,
    sessions: filteredSessions,
    settings,
    activeSession,
    createdAt: cleanString(source.createdAt, fallback.createdAt),
    updatedAt: cleanString(source.updatedAt, fallback.updatedAt)
  }
}

export class DataStore {
  readonly dataDirectory: string
  readonly artworkDirectory: string
  readonly backupsDirectory: string
  private readonly dataFile: string
  private data: StoredData = newData()
  private writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.dataDirectory = path.join(app.getPath('userData'), 'data')
    this.artworkDirectory = path.join(this.dataDirectory, 'artwork')
    this.backupsDirectory = path.join(this.dataDirectory, 'backups')
    this.dataFile = path.join(this.dataDirectory, 'orca-data.json')
  }

  async init(): Promise<void> {
    await fs.mkdir(this.artworkDirectory, { recursive: true })
    await fs.mkdir(this.backupsDirectory, { recursive: true })

    try {
      const raw = await fs.readFile(this.dataFile, 'utf8')
      this.data = normalizeData(JSON.parse(raw))
      await this.makeDailyBackup()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        try {
          await fs.copyFile(this.dataFile, path.join(this.backupsDirectory, `corrupt-${stamp}.json`))
        } catch {
          // The original file may be unreadable; starting fresh is still the safest option.
        }
      }
      this.data = newData()
      await this.save()
    }

    await this.cleanupArtwork()
  }

  getSnapshot(): AppSnapshot {
    const totals = new Map<string, { playtimeMs: number; sessionCount: number; lastPlayedAt: string | null }>()
    for (const session of this.data.sessions) {
      const current = totals.get(session.gameId) ?? { playtimeMs: 0, sessionCount: 0, lastPlayedAt: null }
      current.playtimeMs += session.durationMs
      current.sessionCount += 1
      if (!current.lastPlayedAt || Date.parse(session.startedAt) > Date.parse(current.lastPlayedAt)) {
        current.lastPlayedAt = session.endedAt
      }
      totals.set(session.gameId, current)
    }

    const games: Game[] = this.data.games.map((game) => {
      const total = totals.get(game.id)
      return {
        ...game,
        playtimeMs: total?.playtimeMs ?? 0,
        sessionCount: total?.sessionCount ?? 0,
        lastPlayedAt: total?.lastPlayedAt ?? null
      }
    })

    return {
      games,
      sessions: this.data.sessions,
      settings: { ...this.data.settings },
      activeSession: null,
      dataDirectory: this.dataDirectory,
      appVersion: app.getVersion(),
      platform: process.platform
    }
  }

  getGameRecord(id: string): StoredGame | null {
    return this.data.games.find((game) => game.id === id) ?? null
  }

  getGames(): StoredGame[] {
    return this.data.games
  }

  getSessions(): PlaySession[] {
    return this.data.sessions
  }

  getSettings(): Settings {
    return this.data.settings
  }

  getPersistedSession(): StoredActiveSession | null {
    return this.data.activeSession ? { ...this.data.activeSession } : null
  }

  async addGame(input: AddGameInput): Promise<Game> {
    const executablePath = cleanString(input.executablePath)
    if (!executablePath) throw new Error('A game executable is required.')
    if (this.data.games.some((game) => game.executablePath.toLowerCase() === executablePath.toLowerCase())) {
      throw new Error('That executable is already in your library.')
    }

    const now = new Date().toISOString()
    const stored: StoredGame = {
      id: randomUUID(),
      title: cleanString(input.title, 'Untitled game') || 'Untitled game',
      executablePath,
      launchArguments: cleanString(input.launchArguments),
      workingDirectory: cleanString(input.workingDirectory) || path.dirname(executablePath),
      runAsAdmin: Boolean(input.runAsAdmin),
      watchProcess: cleanString(input.watchProcess),
      coverArt: await this.resolveArtworkInput('cover', input.coverArt, input.coverSourcePath),
      heroArt: await this.resolveArtworkInput('hero', input.heroArt, input.heroSourcePath),
      description: cleanString(input.description),
      developer: cleanString(input.developer),
      releaseYear: cleanString(input.releaseYear).slice(0, 4),
      genres: cleanStringArray(input.genres),
      tags: cleanStringArray(input.tags),
      notes: cleanString(input.notes),
      favorite: Boolean(input.favorite),
      hidden: false,
      status: cleanStatus(input.status),
      rating: cleanRating(input.rating),
      addedAt: now,
      updatedAt: now
    }

    this.data.games.push(stored)
    this.data.updatedAt = now
    await this.save()
    return this.getSnapshot().games.find((game) => game.id === stored.id) as Game
  }

  async updateGame(input: UpdateGameInput): Promise<Game> {
    const index = this.data.games.findIndex((game) => game.id === input.id)
    if (index < 0) throw new Error('Game not found.')
    const current = this.data.games[index]
    const now = new Date().toISOString()

    const next: StoredGame = {
      ...current,
      title:
        input.title !== undefined
          ? cleanString(input.title, current.title) || current.title
          : current.title,
      executablePath:
        input.executablePath !== undefined
          ? cleanString(input.executablePath, current.executablePath) || current.executablePath
          : current.executablePath,
      launchArguments:
        input.launchArguments !== undefined ? cleanString(input.launchArguments) : current.launchArguments,
      workingDirectory:
        input.workingDirectory !== undefined
          ? cleanString(input.workingDirectory) || path.dirname(input.executablePath ?? current.executablePath)
          : current.workingDirectory,
      runAsAdmin: input.runAsAdmin !== undefined ? Boolean(input.runAsAdmin) : current.runAsAdmin,
      watchProcess:
        input.watchProcess !== undefined ? cleanString(input.watchProcess) : current.watchProcess,
      coverArt:
        input.coverArt !== undefined || input.coverSourcePath
          ? await this.resolveArtworkInput('cover', input.coverArt, input.coverSourcePath)
          : current.coverArt,
      heroArt:
        input.heroArt !== undefined || input.heroSourcePath
          ? await this.resolveArtworkInput('hero', input.heroArt, input.heroSourcePath)
          : current.heroArt,
      description: input.description !== undefined ? cleanString(input.description) : current.description,
      developer: input.developer !== undefined ? cleanString(input.developer) : current.developer,
      releaseYear:
        input.releaseYear !== undefined ? cleanString(input.releaseYear).slice(0, 4) : current.releaseYear,
      genres: input.genres !== undefined ? cleanStringArray(input.genres) : current.genres,
      tags: input.tags !== undefined ? cleanStringArray(input.tags) : current.tags,
      notes: input.notes !== undefined ? cleanString(input.notes) : current.notes,
      favorite: input.favorite !== undefined ? Boolean(input.favorite) : current.favorite,
      hidden: input.hidden !== undefined ? Boolean(input.hidden) : current.hidden,
      status: input.status !== undefined ? cleanStatus(input.status, current.status) : current.status,
      rating: input.rating !== undefined ? cleanRating(input.rating) : current.rating,
      updatedAt: now
    }

    this.data.games[index] = next
    this.data.updatedAt = now
    await this.save()
    return this.getSnapshot().games.find((game) => game.id === next.id) as Game
  }

  async setFavorite(id: string, favorite: boolean): Promise<Game> {
    return this.updateGame({ id, favorite })
  }

  async removeGame(id: string): Promise<void> {
    const game = this.data.games.find((item) => item.id === id)
    if (!game) return
    this.data.games = this.data.games.filter((item) => item.id !== id)
    this.data.sessions = this.data.sessions.filter((session) => session.gameId !== id)
    if (this.data.activeSession?.gameId === id) this.data.activeSession = null
    this.data.updatedAt = new Date().toISOString()
    await this.save()
    await this.deleteArtworkIfUnused(game.coverArt)
    await this.deleteArtworkIfUnused(game.heroArt)
  }

  async addSession(session: PlaySession): Promise<void> {
    this.data.sessions.unshift(session)
    this.data.activeSession = null
    this.data.updatedAt = new Date().toISOString()
    await this.save()
  }

  async setActiveSession(session: StoredActiveSession | null): Promise<void> {
    this.data.activeSession = session
    this.data.updatedAt = new Date().toISOString()
    await this.save()
  }

  async updateSettings(input: UpdateSettingsInput): Promise<Settings> {
    this.data.settings = {
      ...this.data.settings,
      ...input
    }
    this.data.updatedAt = new Date().toISOString()
    await this.save()
    return { ...this.data.settings }
  }

  async importArtwork(sourcePath: string, kind: 'cover' | 'hero'): Promise<string> {
    const extension = path.extname(sourcePath).toLowerCase()
    if (!ART_EXTENSIONS.has(extension)) {
      throw new Error('Choose a PNG, JPG, WEBP, GIF, or AVIF image.')
    }
    const stat = await fs.stat(sourcePath)
    if (!stat.isFile()) throw new Error('The selected artwork is not a file.')
    if (stat.size > 40 * 1024 * 1024) throw new Error('Artwork must be smaller than 40 MB.')

    const key = `${kind}-${randomUUID()}${extension}`
    await fs.copyFile(sourcePath, path.join(this.artworkDirectory, key))
    return key
  }

  async importArtworkFromBuffer(buffer: Buffer, ext: string, kind: 'cover' | 'hero'): Promise<string> {
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
    const key = `${kind}-${randomUUID()}.${safeExt}`
    await fs.writeFile(path.join(this.artworkDirectory, key), buffer)
    return key
  }

  getArtworkPath(key: string): string | null {
    if (!key || path.basename(key) !== key) return null
    const extension = path.extname(key).toLowerCase()
    if (!ART_EXTENSIONS.has(extension)) return null
    return path.join(this.artworkDirectory, key)
  }

  async exportBackup(destination: string): Promise<void> {
    await this.save()
    await fs.copyFile(this.dataFile, destination)
  }

  private async resolveArtworkInput(
    kind: 'cover' | 'hero',
    key?: string | null,
    sourcePath?: string | null
  ): Promise<string | null> {
    if (sourcePath) return this.importArtwork(sourcePath, kind)
    const cleanKey = cleanString(key)
    if (!cleanKey) return null
    if (path.basename(cleanKey) !== cleanKey) return null
    try {
      await fs.access(path.join(this.artworkDirectory, cleanKey))
      return cleanKey
    } catch {
      return null
    }
  }

  private async deleteArtworkIfUnused(key: string | null): Promise<void> {
    if (!key) return
    const referenced = this.data.games.some((game) => game.coverArt === key || game.heroArt === key)
    if (referenced) return
    try {
      await fs.unlink(path.join(this.artworkDirectory, key))
    } catch {
      // Artwork may already be gone.
    }
  }

  private async cleanupArtwork(): Promise<void> {
    const referenced = new Set<string>()
    for (const game of this.data.games) {
      if (game.coverArt) referenced.add(game.coverArt)
      if (game.heroArt) referenced.add(game.heroArt)
    }
    const entries = await fs.readdir(this.artworkDirectory, { withFileTypes: true })
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const entry of entries) {
      if (!entry.isFile() || referenced.has(entry.name)) continue
      const filePath = path.join(this.artworkDirectory, entry.name)
      try {
        const stat = await fs.stat(filePath)
        if (stat.mtimeMs < cutoff) await fs.unlink(filePath)
      } catch {
        // Ignore individual artwork cleanup failures.
      }
    }
  }

  private async makeDailyBackup(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)
    const backupPath = path.join(this.backupsDirectory, `orca-${today}.json`)
    try {
      await fs.access(backupPath)
      return
    } catch {
      // A backup for today does not exist yet.
    }
    try {
      await fs.copyFile(this.dataFile, backupPath)
      const entries = (await fs.readdir(this.backupsDirectory))
        .filter((name) => name.startsWith('orca-') && name.endsWith('.json'))
        .sort()
      for (const name of entries.slice(0, Math.max(0, entries.length - 10))) {
        await fs.unlink(path.join(this.backupsDirectory, name)).catch(() => undefined)
      }
    } catch {
      // Backups are best-effort.
    }
  }

  private save(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2)
    const tempFile = `${this.dataFile}.tmp`
    const write = this.writeQueue.then(async () => {
      await fs.mkdir(this.dataDirectory, { recursive: true })
      await fs.writeFile(tempFile, payload, 'utf8')
      try {
        await fs.rename(tempFile, this.dataFile)
      } catch {
        await fs.rm(this.dataFile, { force: true })
        await fs.rename(tempFile, this.dataFile)
      }
    })
    this.writeQueue = write.catch(() => undefined)
    return write
  }
}

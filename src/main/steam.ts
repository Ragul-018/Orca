/**
 * steam.ts — keyless Steam library discovery.
 *
 * Steam keeps a `libraryfolders.vdf` index next to its `steamapps` folder and
 * one `appmanifest_<appid>.acf` file per installed app. Both use Valve's
 * KeyValues text format, which is parsed here without any third-party
 * dependency. Artwork comes from Steam's public CDN.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  SteamGame,
  SteamImportProgress,
  SteamImportResult,
  SteamLibraryScan
} from '@shared/types'
import { downloadImageBuffer, steamArtworkUrls } from './artwork-fetcher'
import type { DataStore } from './data-store'
import { findGameExecutable } from './scanner'

const execFileAsync = promisify(execFile)

type VdfValue = string | VdfObject
interface VdfObject {
  [key: string]: VdfValue
}

interface SteamManifest {
  appId: number
  title: string
  installDir: string
  libraryPath: string
  installPath: string
  sizeOnDisk: number
  lastPlayedAt: string | null
  stateFlags: number
}

const EXCLUDED_APP_IDS = new Set([
  228980, // Steamworks Common Redistributables
  1070560, // Steam Linux Runtime 1.0 (scout)
  1391110, // Steam Linux Runtime 2.0 (soldier)
  1628350, // Steam Linux Runtime 3.0 (sniper)
  1493710, // Proton Experimental
  2180100, // Proton Hotfix
  961940, // Proton EasyAntiCheat Runtime
  1826330, // Proton BattlEye Runtime
  250820, // SteamVR
  1054830, // Steam Audio
  1007 // Steamworks SDK
])

let scanCache: { at: number; result: SteamLibraryScan } | null = null

function isVdfObject(value: VdfValue | undefined): value is VdfObject {
  return Boolean(value) && typeof value === 'object'
}

function vdfString(value: VdfValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Parse Valve KeyValues (VDF/ACF) text. Supports quoted keys and values,
 * nested blocks, comments, and escaped quotes.
 */
export function parseVdf(input: string): VdfObject {
  const text = input.replace(/^\uFEFF/, '')
  let index = 0

  function skipIgnored(): void {
    while (index < text.length) {
      const char = text[index]
      if (/\s/.test(char)) {
        index += 1
        continue
      }
      if (char === '/' && text[index + 1] === '/') {
        index += 2
        while (index < text.length && text[index] !== '\n') index += 1
        continue
      }
      if (char === '/' && text[index + 1] === '*') {
        index += 2
        while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1
        index += 2
        continue
      }
      break
    }
  }

  function readToken(): string | null {
    skipIgnored()
    if (index >= text.length) return null

    const char = text[index]
    if (char === '{' || char === '}') {
      index += 1
      return char
    }

    if (char === '"') {
      index += 1
      let value = ''
      while (index < text.length) {
        const current = text[index]
        if (current === '\\') {
          const next = text[index + 1]
          if (next === 'n') value += '\n'
          else if (next === 't') value += '\t'
          else value += next ?? ''
          index += 2
          continue
        }
        if (current === '"') {
          index += 1
          break
        }
        value += current
        index += 1
      }
      return value
    }

    const start = index
    while (index < text.length && !/[\s{}]/.test(text[index])) index += 1
    return text.slice(start, index)
  }

  function parseObject(): VdfObject {
    const result: VdfObject = {}
    while (index < text.length) {
      const key = readToken()
      if (key === null || key === '}') break
      const value = readToken()
      if (value === null) break
      if (value === '{') {
        result[key] = parseObject()
      } else if (value !== '}') {
        result[key] = value
      }
    }
    return result
  }

  return parseObject()
}

async function readRegistryValue(key: string, valueName: string): Promise<string | null> {
  try {
    const result = (await execFileAsync('reg.exe', ['query', key, '/v', valueName], {
      windowsHide: true,
      timeout: 5_000,
      encoding: 'utf8'
    })) as { stdout?: string }
    const line = (result.stdout ?? '')
      .split(/\r?\n/)
      .find((entry) => entry.toLowerCase().includes(valueName.toLowerCase()))
    if (!line) return null
    const match = line.match(/REG_(?:SZ|EXPAND_SZ)\s+(.+)$/i)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directory)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function locateSteam(): Promise<string | null> {
  const override = process.env.ORCA_STEAM_PATH?.trim()
  if (override) {
    const normalized = path.resolve(override.replace(/\//g, '\\'))
    if (await directoryExists(path.join(normalized, 'steamapps'))) return normalized
  }

  const registryCandidates: Array<[string, string]> = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']
  ]

  for (const [key, value] of registryCandidates) {
    const found = await readRegistryValue(key, value)
    if (!found) continue
    const normalized = path.resolve(found.replace(/\//g, '\\'))
    if (await directoryExists(path.join(normalized, 'steamapps'))) return normalized
  }

  const fallbacks = [
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Steam'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Steam'),
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam'
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of fallbacks) {
    const normalized = path.resolve(candidate)
    if (await directoryExists(path.join(normalized, 'steamapps'))) return normalized
  }

  return null
}

async function readLibraryFolders(steamPath: string): Promise<string[]> {
  const libraries = new Set<string>([path.resolve(steamPath)])
  const indexFiles = [
    path.join(steamPath, 'steamapps', 'libraryfolders.vdf'),
    path.join(steamPath, 'config', 'libraryfolders.vdf')
  ]

  for (const file of indexFiles) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const parsed = parseVdf(raw)
      const root =
        (isVdfObject(parsed.libraryfolders) && parsed.libraryfolders) ||
        (isVdfObject(parsed.LibraryFolders) && parsed.LibraryFolders) ||
        parsed

      for (const [key, value] of Object.entries(root)) {
        if (isVdfObject(value)) {
          const libraryPath = vdfString(value.path)
          if (libraryPath) libraries.add(path.resolve(libraryPath.replace(/\//g, '\\')))
          continue
        }
        // Older Steam clients stored `"1" "D:\\SteamLibrary"` entries.
        if (/^\d+$/.test(key) && /^[a-zA-Z]:[\\/]/.test(value)) {
          libraries.add(path.resolve(value.replace(/\//g, '\\')))
        }
      }
    } catch {
      // A missing or unreadable index just means the default library is used.
    }
  }

  const existing: string[] = []
  for (const library of libraries) {
    if (await directoryExists(path.join(library, 'steamapps'))) existing.push(library)
  }
  return existing
}

function isExcludedSteamApp(appId: number, title: string, installDir: string): boolean {
  if (EXCLUDED_APP_IDS.has(appId)) return true
  const haystack = `${title} ${installDir}`.toLowerCase()
  return /steamworks common redistributables|steam linux runtime|proton (experimental|hotfix|next)|steamvr|steam audio|steamworks sdk/.test(
    haystack
  )
}

function lastPlayedIso(value: string): string | null {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1_000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

async function readManifests(libraries: string[]): Promise<SteamManifest[]> {
  const manifests: SteamManifest[] = []

  for (const library of libraries) {
    const steamapps = path.join(library, 'steamapps')
    let entries
    try {
      entries = await fs.readdir(steamapps, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue
      const match = entry.name.match(/^appmanifest_(\d+)\.acf$/i)
      if (!match) continue

      try {
        const raw = await fs.readFile(path.join(steamapps, entry.name), 'utf8')
        const parsed = parseVdf(raw)
        const appState = isVdfObject(parsed.AppState) ? parsed.AppState : null
        if (!appState) continue

        const appId = Number(vdfString(appState.appid) || match[1])
        const title = vdfString(appState.name).trim()
        const installDirName = vdfString(appState.installdir).trim()
        if (!Number.isInteger(appId) || appId <= 0 || !title || !installDirName) continue
        if (isExcludedSteamApp(appId, title, installDirName)) continue

        const stateFlags = Number(vdfString(appState.StateFlags)) || 0
        const commonRoot = path.resolve(steamapps, 'common')
        const installPath = path.resolve(commonRoot, installDirName)
        if (
          installPath.toLowerCase() !== commonRoot.toLowerCase() &&
          !installPath.toLowerCase().startsWith(`${commonRoot.toLowerCase()}${path.sep}`)
        ) {
          continue
        }

        const installed = (stateFlags & 4) === 4 || (await directoryExists(installPath))
        if (!installed) continue

        manifests.push({
          appId,
          title,
          installDir: installPath,
          libraryPath: library,
          installPath,
          sizeOnDisk: Number(vdfString(appState.SizeOnDisk)) || 0,
          lastPlayedAt: lastPlayedIso(vdfString(appState.LastPlayed)),
          stateFlags
        })
      } catch {
        // Ignore a single malformed manifest.
      }
    }
  }

  return manifests
}

export async function scanSteamLibrary(
  store: DataStore,
  options: { force?: boolean } = {}
): Promise<SteamLibraryScan> {
  if (!options.force && scanCache && Date.now() - scanCache.at < 60_000) {
    return scanCache.result
  }

  const steamPath = await locateSteam()
  if (!steamPath) {
    throw new Error('Steam was not found on this PC. Install Steam or add a game manually.')
  }

  const libraries = await readLibraryFolders(steamPath)
  const manifests = await readManifests(libraries)
  const existing = store.getGames()
  const existingPaths = new Set(existing.map((game) => game.executablePath.toLowerCase()))
  const existingSteamIds = new Set(
    existing
      .map((game) => game.steamAppId)
      .filter((appId): appId is number => typeof appId === 'number')
  )

  const games: SteamGame[] = []
  for (const manifest of manifests) {
    const executable = await findGameExecutable(manifest.installPath, manifest.title).catch(() => null)
    const artwork = steamArtworkUrls(manifest.appId)
    const alreadyInLibrary =
      existingSteamIds.has(manifest.appId) ||
      Boolean(executable && existingPaths.has(executable.executablePath.toLowerCase()))

    games.push({
      appId: manifest.appId,
      title: manifest.title,
      installDir: manifest.installDir,
      libraryPath: manifest.libraryPath,
      executablePath: executable?.executablePath ?? null,
      workingDirectory: executable?.workingDirectory ?? manifest.installDir,
      launchArguments: '',
      sizeOnDisk: manifest.sizeOnDisk,
      lastPlayedAt: manifest.lastPlayedAt,
      coverUrl: artwork.cover,
      heroUrl: artwork.hero,
      headerUrl: artwork.header,
      alreadyInLibrary,
      confidence: executable?.confidence ?? 0,
      stateFlags: manifest.stateFlags
    })
  }

  games.sort((a, b) => a.title.localeCompare(b.title))
  const result: SteamLibraryScan = { steamPath, libraries, games }
  scanCache = { at: Date.now(), result }
  return result
}

export function invalidateSteamScanCache(): void {
  scanCache = null
}

export async function importSteamGames(
  appIds: number[],
  store: DataStore,
  onProgress: (progress: SteamImportProgress) => void
): Promise<SteamImportResult> {
  const scan = await scanSteamLibrary(store, { force: true })
  const byId = new Map(scan.games.map((game) => [game.appId, game]))
  const result: SteamImportResult = { added: 0, skipped: 0, failed: [] }
  const total = appIds.length

  for (const [index, appId] of appIds.entries()) {
    const game = byId.get(appId)
    if (!game) {
      result.skipped += 1
      onProgress({
        appId,
        title: `Steam app ${appId}`,
        index,
        total,
        stage: 'skipped',
        message: 'This app is no longer installed.'
      })
      continue
    }

    if (game.alreadyInLibrary) {
      result.skipped += 1
      onProgress({ appId, title: game.title, index, total, stage: 'skipped', message: 'Already in your library.' })
      continue
    }

    if (!game.executablePath) {
      result.failed.push({ appId, title: game.title, error: 'No game executable was found in its install folder.' })
      onProgress({
        appId,
        title: game.title,
        index,
        total,
        stage: 'error',
        message: 'No executable found.'
      })
      continue
    }

    onProgress({ appId, title: game.title, index, total, stage: 'artwork' })

    let coverArt: string | null = null
    let heroArt: string | null = null
    try {
      const { buffer, ext } = await downloadImageBuffer(game.coverUrl, 'cover')
      coverArt = await store.importArtworkFromBuffer(buffer, ext, 'cover')
    } catch {
      // A missing cover should never block an import.
    }
    try {
      const { buffer, ext } = await downloadImageBuffer(game.heroUrl, 'hero')
      heroArt = await store.importArtworkFromBuffer(buffer, ext, 'hero')
    } catch {
      // A missing hero should never block an import.
    }

    onProgress({ appId, title: game.title, index, total, stage: 'saving' })

    try {
      await store.addGame({
        title: game.title,
        executablePath: game.executablePath,
        workingDirectory: game.workingDirectory,
        watchProcess: path.basename(game.executablePath),
        steamAppId: game.appId,
        tags: ['Steam'],
        coverArt,
        heroArt
      })
      result.added += 1
      onProgress({ appId, title: game.title, index, total, stage: 'done' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The game could not be added.'
      if (/already/i.test(message)) {
        result.skipped += 1
        onProgress({ appId, title: game.title, index, total, stage: 'skipped', message })
      } else {
        result.failed.push({ appId, title: game.title, error: message })
        onProgress({ appId, title: game.title, index, total, stage: 'error', message })
      }
    }
  }

  scanCache = null
  return result
}

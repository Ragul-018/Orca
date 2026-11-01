import { nativeImage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ExecutableChoice, ScanCandidate } from '@shared/types'
import { titleFromPath } from '@shared/format'
import type { DataStore } from './data-store'
import { resolveShortcut } from './windows-utils'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
const SKIP_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
  'redist',
  '_commonredist',
  'redistributables',
  'directx',
  'dotnet',
  'vcredist',
  'easyanticheat',
  'battleye',
  'crashreport',
  'crashreporter',
  'support',
  'installers',
  'installer'
])
const EXCLUDED_EXE_PATTERNS = [
  /^unins/i,
  /^setup/i,
  /^install/i,
  /^update/i,
  /^updater/i,
  /^crash/i,
  /crashreport/i,
  /^helper/i,
  /^service/i,
  /^redist/i,
  /^vc_redist/i,
  /^dxsetup/i,
  /^directx/i,
  /^dotnet/i,
  /^oalinst/i,
  /^cleanup/i,
  /^prereq/i,
  /^touchup/i,
  /crashhandler/i,
  /notification_helper/i,
  /steamwebhelper/i,
  /gameoverlayui/i,
  /battleye/i,
  /easyanticheat/i,
  /^be_service/i,
  /^unitycrashhandler/i
]
const COVER_NAMES = [
  'cover',
  'folder',
  'poster',
  'boxart',
  'box_art',
  'box-art',
  'capsule',
  'grid',
  'library_600x900',
  'library_600x900_2x',
  'library_600x900_2x.jpg'
]
const HERO_NAMES = [
  'hero',
  'background',
  'banner',
  'header',
  'wide',
  'keyart',
  'key_art',
  'library_hero',
  'library_hero_2x',
  'landscape',
  'art'
]

interface FoundExecutable {
  executablePath: string
  size: number
  modifiedAt: string
  score: number
}

interface FoundArtwork {
  path: string
  name: string
  kind: 'cover' | 'hero'
  score: number
}

export async function inspectExecutable(filePath: string): Promise<ExecutableChoice> {
  const extension = path.extname(filePath).toLowerCase()

  if (extension === '.lnk') {
    const shortcut = await resolveShortcut(filePath)
    if (!shortcut) throw new Error('That shortcut does not point to a game executable.')
    const targetExtension = path.extname(shortcut.targetPath).toLowerCase()
    if (!['.exe', '.bat', '.cmd'].includes(targetExtension)) {
      throw new Error('That shortcut does not point to a supported game executable.')
    }
    return {
      executablePath: shortcut.targetPath,
      suggestedTitle: titleFromPath(shortcut.targetPath),
      workingDirectory: shortcut.workingDirectory || path.dirname(shortcut.targetPath),
      launchArguments: shortcut.arguments
    }
  }

  if (!['.exe', '.bat', '.cmd'].includes(extension)) {
    throw new Error('Choose an EXE, shortcut, batch file, or command file.')
  }

  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('That path is not a file.')
  return {
    executablePath: filePath,
    suggestedTitle: suggestedTitleFor(filePath, path.dirname(filePath)),
    workingDirectory: path.dirname(filePath),
    launchArguments: ''
  }
}

export async function scanFolder(folder: string, store: DataStore): Promise<ScanCandidate[]> {
  const root = path.resolve(folder)
  const found: FoundExecutable[] = []
  let visited = 0

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > 4 || visited > 8_000) return
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      visited += 1
      if (visited > 8_000) return
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name.toLowerCase())) continue
        await walk(fullPath, depth + 1)
        continue
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.exe')) continue
      if (EXCLUDED_EXE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue
      if (isInsideSkippedDirectory(fullPath)) continue

      try {
        const stat = await fs.stat(fullPath)
        if (stat.size < 64 * 1024) continue
        found.push({
          executablePath: fullPath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          score: scoreExecutable(fullPath, root, stat.size)
        })
      } catch {
        // Skip unreadable executables.
      }
    }
  }

  await walk(root, 0)

  const bestByExecutable = new Map<string, FoundExecutable>()
  for (const candidate of found.sort((a, b) => b.score - a.score)) {
    const key = candidate.executablePath.toLowerCase()
    if (!bestByExecutable.has(key)) bestByExecutable.set(key, candidate)
  }

  const top = [...bestByExecutable.values()].slice(0, 12)
  const candidates: ScanCandidate[] = []

  for (const candidate of top) {
    const directory = path.dirname(candidate.executablePath)
    const artwork = await findArtwork(directory)
    let coverArt: string | null = null
    let heroArt: string | null = null

    for (const art of artwork) {
      if (art.kind === 'cover' && !coverArt) {
        coverArt = await store.importArtwork(art.path, 'cover').catch(() => null)
      }
      if (art.kind === 'hero' && !heroArt) {
        heroArt = await store.importArtwork(art.path, 'hero').catch(() => null)
      }
      if (coverArt && heroArt) break
    }

    candidates.push({
      executablePath: candidate.executablePath,
      name: path.basename(candidate.executablePath),
      directory,
      size: candidate.size,
      modifiedAt: candidate.modifiedAt,
      confidence: Math.max(0, Math.min(100, candidate.score)),
      coverArt,
      heroArt,
      suggestedTitle: suggestedTitleFor(candidate.executablePath, directory)
    })
  }

  return candidates
}

function isInsideSkippedDirectory(filePath: string): boolean {
  const parts = filePath.toLowerCase().split(/[\\/]+/)
  return parts.some((part) => SKIP_DIRECTORIES.has(part))
}

function scoreExecutable(filePath: string, root: string, size: number): number {
  const fileName = path.basename(filePath, path.extname(filePath)).toLowerCase()
  const executableDir = path.dirname(filePath)
  const folderName = path.basename(root).toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalizedName = fileName.replace(/[^a-z0-9]/g, '')
  const relative = path.relative(root, filePath)
  const depth = relative.split(/[\\/]/).length - 1

  let score = 24
  if (size >= 1024 * 1024) score += 12
  if (size >= 20 * 1024 * 1024) score += 16
  if (size >= 100 * 1024 * 1024) score += 14
  if (normalizedName === folderName) score += 42
  else if (normalizedName.includes(folderName) || folderName.includes(normalizedName)) score += 22
  if (/shipping$/i.test(fileName)) score += 30
  if (/binaries[\\/]win64/i.test(executableDir)) score += 18
  if (depth <= 1) score += 14
  if (depth === 2) score += 4
  if (fileName.includes('launcher') || fileName.includes('launch')) score -= 16
  if (/crash|report|helper|server|dedicated|editor|benchmark|tool|config|diagnostic/i.test(fileName)) score -= 55
  if (/unins|setup|install|update|redist|directx|dotnet|vc_redist/i.test(fileName)) score -= 100
  return Math.round(score)
}

function suggestedTitleFor(executablePath: string, directory: string): string {
  const fileName = path.basename(executablePath, path.extname(executablePath))
    .replace(/-(win64|win32)-shipping$/i, '')
    .replace(/[._-](x64|x86)$/i, '')
  const cleanedExe = titleFromPath(fileName)
  const folderTitle = titleFromPath(path.basename(directory))
  const weakExeNames = /^(game|client|launcher|start|play|app|application|bin|run)$/i
  if (weakExeNames.test(fileName) && folderTitle.length > 2) return folderTitle
  return cleanedExe || folderTitle || 'Untitled game'
}

async function findArtwork(directory: string): Promise<FoundArtwork[]> {
  const searchDirectories = [directory, path.dirname(directory)]
  const found: FoundArtwork[] = []
  const seen = new Set<string>()

  for (const searchDirectory of searchDirectories) {
    let entries
    try {
      entries = await fs.readdir(searchDirectory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!IMAGE_EXTENSIONS.has(extension)) continue
      if (seen.has(entry.name.toLowerCase())) continue
      const baseName = path.basename(entry.name, extension).toLowerCase()
      const coverRank = nameRank(baseName, COVER_NAMES)
      const heroRank = nameRank(baseName, HERO_NAMES)
      if (coverRank < 0 && heroRank < 0) continue

      const fullPath = path.join(searchDirectory, entry.name)
      let kind: 'cover' | 'hero' = coverRank >= 0 && (heroRank < 0 || coverRank <= heroRank) ? 'cover' : 'hero'
      let score = Math.max(coverRank, heroRank)
      try {
        const stat = await fs.stat(fullPath)
        if (stat.size > 30 * 1024 * 1024 || stat.size < 5_000) continue
        const image = nativeImage.createFromPath(fullPath)
        if (image.isEmpty()) continue
        const size = image.getSize()
        if (size.width < 240 || size.height < 240) continue
        const ratio = size.width / Math.max(1, size.height)
        if (ratio >= 1.35) kind = 'hero'
        if (ratio <= 0.95) kind = 'cover'
        score += Math.min(20, Math.round(size.width / 100))
      } catch {
        continue
      }

      seen.add(entry.name.toLowerCase())
      found.push({ path: fullPath, name: entry.name, kind, score })
    }
  }

  return found.sort((a, b) => b.score - a.score).slice(0, 6)
}

function nameRank(baseName: string, knownNames: string[]): number {
  const index = knownNames.indexOf(baseName)
  if (index >= 0) return 100 - index
  if (knownNames.some((known) => baseName.startsWith(known))) return 50
  if (knownNames.some((known) => baseName.includes(known))) return 30
  return -1
}

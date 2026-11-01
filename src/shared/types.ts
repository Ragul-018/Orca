export const GAME_STATUSES = ['unplayed', 'playing', 'completed', 'on-hold', 'dropped'] as const
export type GameStatus = (typeof GAME_STATUSES)[number]

export const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  unplayed: 'Unplayed',
  playing: 'Playing',
  completed: 'Completed',
  'on-hold': 'On hold',
  dropped: 'Dropped'
}

export interface Game {
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
  playtimeMs: number
  lastPlayedAt: string | null
  sessionCount: number
}

export interface AddGameInput {
  title: string
  executablePath: string
  launchArguments?: string
  workingDirectory?: string
  runAsAdmin?: boolean
  watchProcess?: string
  description?: string
  developer?: string
  releaseYear?: string
  genres?: string[]
  tags?: string[]
  notes?: string
  favorite?: boolean
  status?: GameStatus
  rating?: number | null
  coverArt?: string | null
  heroArt?: string | null
  coverSourcePath?: string | null
  heroSourcePath?: string | null
}

export interface UpdateGameInput extends Partial<AddGameInput> {
  id: string
  hidden?: boolean
}

export interface PlaySession {
  id: string
  gameId: string
  startedAt: string
  endedAt: string
  durationMs: number
  source: 'launcher' | 'external'
  endReason: 'exited' | 'stopped' | 'recovered'
}

export interface ActiveSession {
  id: string
  gameId: string
  startedAt: string
  elapsedMs: number
  processName: string
  source: 'launcher' | 'external'
}

export interface Settings {
  minimizeOnLaunch: boolean
  closeToTray: boolean
  launchAtStartup: boolean
  confirmStopGame: boolean
  showPlaytimeOnCards: boolean
  trackExternalGames: boolean
  rawgApiKey: string
  igdbClientId: string
  igdbClientSecret: string
}

export const DEFAULT_SETTINGS: Settings = {
  minimizeOnLaunch: true,
  closeToTray: true,
  launchAtStartup: false,
  confirmStopGame: true,
  showPlaytimeOnCards: true,
  trackExternalGames: false,
  rawgApiKey: '',
  igdbClientId: '',
  igdbClientSecret: ''
}

export interface ArtworkCandidate {
  id: string
  title: string
  developer: string
  releaseYear: string
  summary?: string
  genres?: string[]
  coverUrl: string | null       // square/portrait cover
  heroUrl: string | null        // wide hero banner
  screenshotUrls: string[]      // additional screenshots
  source: 'igdb' | 'steam' | 'rawg'
  steamAppId: number | null
  igdbId?: number | null
  rawgSlug?: string | null
}

export interface ArtworkSearchResult {
  query: string
  candidates: ArtworkCandidate[]
  error?: string
}

export interface AppSnapshot {
  games: Game[]
  sessions: PlaySession[]
  settings: Settings
  activeSession: ActiveSession | null
  dataDirectory: string
  appVersion: string
  platform: string
}

export interface ScanCandidate {
  executablePath: string
  name: string
  directory: string
  size: number
  modifiedAt: string
  confidence: number
  coverArt: string | null
  heroArt: string | null
  suggestedTitle: string
}

export interface ExecutableChoice {
  executablePath: string
  suggestedTitle: string
  workingDirectory: string
  launchArguments: string
}

export interface LaunchResult {
  ok: boolean
  error?: string
  activeSession?: ActiveSession
}

export type WindowAction = 'minimize' | 'maximize' | 'close' | 'quit'

export interface UpdateSettingsInput extends Partial<Settings> {}

export interface OrcaApi {
  getSnapshot: () => Promise<AppSnapshot>
  addGame: (input: AddGameInput) => Promise<Game>
  updateGame: (input: UpdateGameInput) => Promise<Game>
  removeGame: (id: string) => Promise<void>
  setFavorite: (id: string, favorite: boolean) => Promise<Game>
  launchGame: (id: string) => Promise<LaunchResult>
  stopSession: () => Promise<void>
  updateSettings: (input: UpdateSettingsInput) => Promise<Settings>
  chooseExecutable: () => Promise<ExecutableChoice | null>
  chooseFolder: () => Promise<string | null>
  scanFolder: () => Promise<{ folder: string; candidates: ScanCandidate[] } | null>
  chooseArtwork: (kind: 'cover' | 'hero') => Promise<string | null>
  fetchArtwork: (
    query: string,
    options?: { rawgApiKey?: string; igdbClientId?: string; igdbClientSecret?: string } | string
  ) => Promise<ArtworkSearchResult>
  importArtworkUrl: (url: string, kind: 'cover' | 'hero') => Promise<string | null>
  revealGameFolder: (id: string) => Promise<void>
  exportBackup: () => Promise<string | null>
  openDataFolder: () => Promise<void>
  windowAction: (action: WindowAction) => Promise<void>
  onLibraryChanged: (callback: (snapshot: AppSnapshot) => void) => () => void
  onSessionChanged: (callback: (session: ActiveSession | null) => void) => () => void
  onToast: (callback: (message: string) => void) => () => void
}

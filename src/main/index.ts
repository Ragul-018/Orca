import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  protocol,
  shell,
  Tray
} from 'electron'
import type { OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'electron'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type { AddGameInput, AppSnapshot, Settings, UpdateGameInput } from '@shared/types'
import { GAME_STATUSES } from '@shared/types'
import { APP_ID, APP_NAME, IPC, PROTOCOL } from '@shared/constants'
import { formatDuration } from '@shared/format'
import { DataStore } from './data-store'
import { SessionManager } from './session-manager'
import { inspectExecutable, scanFolder } from './scanner'
import { searchArtwork, downloadImageBuffer } from './artwork-fetcher'

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

// Allow automated smoke runs and power users to keep Orca's library elsewhere.
// This must happen before the single-instance lock, which is keyed by userData.
const userDataOverride = process.env.ORCA_USER_DATA?.trim()
if (userDataOverride) app.setPath('userData', resolve(userDataOverride))

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.commandLine.appendSwitch('disable-gpu-cache')
app.setAppUserModelId(APP_ID)
app.setName(APP_NAME)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: DataStore
let sessions: SessionManager
let isQuitting = false
let allowQuit = false

const startHidden = process.argv.includes('--autostart')

const idSchema = z.string().uuid()
const reorderGamesSchema = z.array(idSchema).min(1).max(5_000)
const optionalText = (max = 2_000) => z.string().trim().max(max).optional()
const textList = z.array(z.string().trim().min(1).max(60)).max(30).optional()
const artworkKey = z.string().max(300).nullable().optional()
const gameStatusSchema = z.enum(GAME_STATUSES)

const addGameSchema = z.object({
  title: z.string().trim().min(1).max(200),
  executablePath: z.string().trim().min(1).max(2_000),
  launchArguments: optionalText(4_000),
  workingDirectory: optionalText(2_000),
  runAsAdmin: z.boolean().optional(),
  watchProcess: optionalText(300),
  description: optionalText(6_000),
  developer: optionalText(300),
  releaseYear: optionalText(4),
  genres: textList,
  tags: textList,
  notes: optionalText(10_000),
  favorite: z.boolean().optional(),
  status: gameStatusSchema.optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  coverArt: artworkKey,
  heroArt: artworkKey,
  coverSourcePath: z.string().max(2_000).nullable().optional(),
  heroSourcePath: z.string().max(2_000).nullable().optional()
})

const updateGameSchema = addGameSchema.partial().extend({
  id: idSchema,
  hidden: z.boolean().optional()
})

const settingsSchema = z
  .object({
    minimizeOnLaunch: z.boolean().optional(),
    closeToTray: z.boolean().optional(),
    launchAtStartup: z.boolean().optional(),
    confirmStopGame: z.boolean().optional(),
    showPlaytimeOnCards: z.boolean().optional(),
    trackExternalGames: z.boolean().optional(),
    rawgApiKey: z.string().max(200).optional(),
    igdbClientId: z.string().max(200).optional(),
    igdbClientSecret: z.string().max(200).optional()
  })
  .strict()

const windowActionSchema = z.enum(['minimize', 'maximize', 'close', 'quit'])
const artworkKindSchema = z.enum(['cover', 'hero'])

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(issue ? `${issue.path.join('.') || 'Input'}: ${issue.message}` : 'Invalid input.')
  }
  return result.data
}

function currentSnapshot(): AppSnapshot {
  const snapshot = store.getSnapshot()
  snapshot.activeSession = sessions.getActiveSession()
  return snapshot
}

function sendToRenderer(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

function broadcastLibrary(): void {
  sendToRenderer(IPC.libraryChanged, currentSnapshot())
  refreshTrayMenu()
}

function gameTitle(gameId: string | undefined): string {
  if (!gameId) return 'Game'
  return store.getSnapshot().games.find((game) => game.id === gameId)?.title ?? 'Game'
}

function applyLoginItemSetting(settings: Settings): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtStartup,
      path: process.execPath,
      args: ['--autostart']
    })
  } catch {
    // Startup registration is best-effort.
  }
}

async function requestQuit(): Promise<void> {
  if (allowQuit) return
  isQuitting = true
  if (sessions) {
    await Promise.race([
      sessions.persistActiveSession(),
      new Promise((resolve) => setTimeout(resolve, 1_500))
    ]).catch(() => undefined)
  }
  allowQuit = true
  app.quit()
}

function appIconPath(): string {
  return join(app.getAppPath(), 'resources', 'icon.png')
}

function trayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray', 'tray.png')
    : join(app.getAppPath(), 'resources', 'tray', 'tray.png')
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  if (mainWindow && !mainWindow.isDestroyed()) return dialog.showOpenDialog(mainWindow, options)
  return dialog.showOpenDialog(options)
}

function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  if (mainWindow && !mainWindow.isDestroyed()) return dialog.showSaveDialog(mainWindow, options)
  return dialog.showSaveDialog(options)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    frame: false,
    backgroundColor: '#05070a',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow.setMenu(null)

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    if (allowQuit) return
    event.preventDefault()
    if (store?.getSettings().closeToTray) {
      mainWindow?.hide()
    } else {
      void requestQuit()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (currentUrl && url !== currentUrl) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  let image = nativeImage.createFromPath(trayIconPath())
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(appIconPath())
  }
  if (image.isEmpty()) return
  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip(APP_NAME)
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  const active = sessions.getActiveSession()
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open Orca',
      click: showWindow
    }
  ]

  if (active) {
    const title = gameTitle(active.gameId)
    template.push(
      { type: 'separator' },
      { label: `${title} — ${formatDuration(active.elapsedMs, { compact: true })}`, enabled: false },
      {
        label: 'Stop game',
        click: () => {
          void sessions.stopActiveSession()
        }
      }
    )
  }

  template.push(
    { type: 'separator' },
    {
      label: 'Quit Orca',
      click: () => {
        void requestQuit()
      }
    }
  )

  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.setToolTip(active ? `${APP_NAME} — ${gameTitle(active.gameId)}` : APP_NAME)
}

function registerProtocol(): void {
  protocol.handle(PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'art') return new Response('Not found', { status: 404 })
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const artworkPath = store.getArtworkPath(key)
      if (!artworkPath) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(artworkPath).toString())
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerIpc(): void {
  ipcMain.handle(IPC.getSnapshot, () => currentSnapshot())

  ipcMain.handle(IPC.addGame, async (_event, input: unknown) => {
    const parsed = parseInput(addGameSchema, input) as AddGameInput
    const game = await store.addGame(parsed)
    broadcastLibrary()
    return game
  })

  ipcMain.handle(IPC.updateGame, async (_event, input: unknown) => {
    const parsed = parseInput(updateGameSchema, input) as UpdateGameInput
    const game = await store.updateGame(parsed)
    broadcastLibrary()
    return game
  })

  ipcMain.handle(IPC.removeGame, async (_event, id: unknown) => {
    const gameId = parseInput(idSchema, id)
    const active = sessions.getActiveSession()
    if (active?.gameId === gameId) throw new Error('Stop this game before removing it.')
    await store.removeGame(gameId)
    broadcastLibrary()
  })

  ipcMain.handle(IPC.reorderGames, async (_event, ids: unknown) => {
    const ordered = parseInput(reorderGamesSchema, ids)
    await store.reorderGames(ordered)
    broadcastLibrary()
  })

  ipcMain.handle(IPC.setFavorite, async (_event, id: unknown, favorite: unknown) => {
    const gameId = parseInput(idSchema, id)
    const value = parseInput(z.boolean(), favorite)
    const game = await store.setFavorite(gameId, value)
    broadcastLibrary()
    return game
  })

  ipcMain.handle(IPC.launchGame, async (_event, id: unknown) => {
    const gameId = parseInput(idSchema, id)
    const result = await sessions.launch(gameId)
    if (result.ok && store.getSettings().minimizeOnLaunch) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
      }, 800)
    }
    broadcastLibrary()
    return result
  })

  ipcMain.handle(IPC.stopSession, async () => {
    await sessions.stopActiveSession()
    broadcastLibrary()
  })

  ipcMain.handle(IPC.updateSettings, async (_event, input: unknown) => {
    const parsed = parseInput(settingsSchema, input)
    const settings = await store.updateSettings(parsed)
    if ('launchAtStartup' in parsed) applyLoginItemSetting(settings)
    broadcastLibrary()
    return settings
  })

  ipcMain.handle(IPC.chooseExecutable, async () => {
    const result = await showOpenDialog({
      title: 'Choose a game executable',
      properties: ['openFile'],
      filters: [
        { name: 'Games and shortcuts', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: 'Windows executables', extensions: ['exe'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return inspectExecutable(result.filePaths[0])
  })

  ipcMain.handle(IPC.chooseFolder, async () => {
    const result = await showOpenDialog({
      title: 'Choose a game folder',
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.scanFolder, async () => {
    const result = await showOpenDialog({
      title: 'Choose a folder to scan for games',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    const candidates = await scanFolder(folder, store)
    return { folder, candidates }
  })

  ipcMain.handle(IPC.chooseArtwork, async (_event, kind: unknown) => {
    const parsedKind = parseInput(artworkKindSchema, kind)
    const result = await showOpenDialog({
      title: parsedKind === 'cover' ? 'Choose cover art' : 'Choose hero artwork',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return store.importArtwork(result.filePaths[0], parsedKind)
  })

  ipcMain.handle(IPC.fetchArtwork, async (_event, query: unknown, optionsOverride: unknown) => {
    const q = parseInput(z.string().trim().min(1).max(300), query)
    const settings = store.getSettings()
    let opts: { rawgApiKey?: string; igdbClientId?: string; igdbClientSecret?: string } = {
      igdbClientId: settings.igdbClientId,
      igdbClientSecret: settings.igdbClientSecret,
      rawgApiKey: settings.rawgApiKey
    }
    if (typeof optionsOverride === 'string' && optionsOverride.trim()) {
      opts.rawgApiKey = optionsOverride.trim()
    } else if (typeof optionsOverride === 'object' && optionsOverride !== null) {
      opts = { ...opts, ...(optionsOverride as Record<string, string>) }
    }
    return searchArtwork(q, opts)
  })

  ipcMain.handle(IPC.importArtworkUrl, async (_event, url: unknown, kind: unknown) => {
    const parsedUrl = parseInput(z.string().url().max(2_000), url)
    const parsedKind = parseInput(artworkKindSchema, kind)
    try {
      const { buffer, ext } = await downloadImageBuffer(parsedUrl, parsedKind)
      return store.importArtworkFromBuffer(buffer, ext, parsedKind)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.revealGameFolder, async (_event, id: unknown) => {
    const gameId = parseInput(idSchema, id)
    const game = store.getGameRecord(gameId)
    if (!game) return
    shell.showItemInFolder(game.executablePath)
  })

  ipcMain.handle(IPC.exportBackup, async () => {
    const date = new Date().toISOString().slice(0, 10)
    const result = await showSaveDialog({
      title: 'Export Orca backup',
      defaultPath: `orca-backup-${date}.json`,
      filters: [{ name: 'JSON backup', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await store.exportBackup(result.filePath)
    return result.filePath
  })

  ipcMain.handle(IPC.openDataFolder, async () => {
    await shell.openPath(store.dataDirectory)
  })

  ipcMain.handle(IPC.windowAction, (_event, action: unknown) => {
    const parsedAction = parseInput(windowActionSchema, action)
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (parsedAction === 'minimize') {
      mainWindow.minimize()
      return
    }
    if (parsedAction === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      else mainWindow.maximize()
      return
    }
    if (parsedAction === 'close') {
      mainWindow.close()
      return
    }
    void requestQuit()
  })
}

async function bootstrap(): Promise<void> {
  await app.whenReady()
  store = new DataStore()
  await store.init()
  sessions = new SessionManager(store)
  registerProtocol()
  registerIpc()

  sessions.on('session', (active) => {
    sendToRenderer(IPC.sessionChanged, active)
    refreshTrayMenu()
  })

  sessions.on('libraryChanged', () => {
    broadcastLibrary()
  })

  sessions.on('ended', (session: { gameId: string; durationMs: number }) => {
    const title = gameTitle(session.gameId)
    const message = `Playtime saved — ${formatDuration(session.durationMs)} in ${title}.`
    sendToRenderer(IPC.toast, message)
    if (mainWindow && (!mainWindow.isVisible() || mainWindow.isMinimized()) && Notification.isSupported()) {
      new Notification({ title: APP_NAME, body: message }).show()
    }
    refreshTrayMenu()
  })

  await sessions.recoverPersistedSession()
  applyLoginItemSetting(store.getSettings())

  Menu.setApplicationMenu(null)
  createWindow()
  createTray()
  broadcastLibrary()

  app.on('second-instance', () => showWindow())
  app.on('activate', () => showWindow())
}

app.on('window-all-closed', () => {
  // Orca stays available in the tray. Quitting is handled explicitly from the app menu or tray.
})

app.on('before-quit', (event) => {
  if (allowQuit) {
    sessions?.dispose()
    return
  }
  event.preventDefault()
  if (!isQuitting) void requestQuit()
})

void bootstrap().catch((error) => {
  console.error(error)
  dialog.showErrorBox('Orca could not start', error instanceof Error ? error.message : String(error))
  allowQuit = true
  app.quit()
})


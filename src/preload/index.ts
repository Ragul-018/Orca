import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import type {
  AddGameInput,
  ActiveSession,
  AppSnapshot,
  ArtworkSearchResult,
  ExecutableChoice,
  LaunchResult,
  OrcaApi,
  Settings,
  SteamImportProgress,
  SteamImportResult,
  SteamLibraryScan,
  UpdateGameInput,
  UpdateSettingsInput,
  UpdateStatus,
  WindowAction
} from "@shared/types"
import { IPC } from "@shared/constants"

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: OrcaApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot) as Promise<AppSnapshot>,
  addGame: (input: AddGameInput) => ipcRenderer.invoke(IPC.addGame, input),
  updateGame: (input: UpdateGameInput) => ipcRenderer.invoke(IPC.updateGame, input),
  removeGame: (id: string) => ipcRenderer.invoke(IPC.removeGame, id),
  reorderGames: (ids: string[]) => ipcRenderer.invoke(IPC.reorderGames, ids),
  setFavorite: (id: string, favorite: boolean) => ipcRenderer.invoke(IPC.setFavorite, id, favorite),
  launchGame: (id: string) => ipcRenderer.invoke(IPC.launchGame, id) as Promise<LaunchResult>,
  stopSession: () => ipcRenderer.invoke(IPC.stopSession),
  updateSettings: (input: UpdateSettingsInput) => ipcRenderer.invoke(IPC.updateSettings, input) as Promise<Settings>,
  chooseExecutable: () => ipcRenderer.invoke(IPC.chooseExecutable) as Promise<ExecutableChoice | null>,
  chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder) as Promise<string | null>,
  scanFolder: () => ipcRenderer.invoke(IPC.scanFolder),
  scanSteamLibrary: () => ipcRenderer.invoke(IPC.scanSteamLibrary) as Promise<SteamLibraryScan>,
  importSteamGames: (appIds: number[]) =>
    ipcRenderer.invoke(IPC.importSteamGames, appIds) as Promise<SteamImportResult>,
  exportPlaytime: () => ipcRenderer.invoke(IPC.exportPlaytime) as Promise<string | null>,
  chooseArtwork: (kind: "cover" | "hero") => ipcRenderer.invoke(IPC.chooseArtwork, kind) as Promise<string | null>,
  fetchArtwork: (
    query: string,
    options?: { rawgApiKey?: string; igdbClientId?: string; igdbClientSecret?: string } | string
  ) => ipcRenderer.invoke(IPC.fetchArtwork, query, options) as Promise<ArtworkSearchResult>,
  importArtworkUrl: (url: string, kind: "cover" | "hero") =>
    ipcRenderer.invoke(IPC.importArtworkUrl, url, kind) as Promise<string | null>,
  revealGameFolder: (id: string) => ipcRenderer.invoke(IPC.revealGameFolder, id),
  exportBackup: () => ipcRenderer.invoke(IPC.exportBackup) as Promise<string | null>,
  restoreBackup: () => ipcRenderer.invoke(IPC.restoreBackup) as Promise<boolean>,
  getUpdateStatus: () => ipcRenderer.invoke(IPC.updateGetStatus) as Promise<UpdateStatus>,
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck) as Promise<UpdateStatus>,
  downloadUpdate: () => ipcRenderer.invoke(IPC.updateDownload) as Promise<void>,
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall) as Promise<void>,
  openDataFolder: () => ipcRenderer.invoke(IPC.openDataFolder),
  windowAction: (action: WindowAction) => ipcRenderer.invoke(IPC.windowAction, action),
  onLibraryChanged: (callback: (snapshot: AppSnapshot) => void) => subscribe(IPC.libraryChanged, callback),
  onSessionChanged: (callback: (session: ActiveSession | null) => void) =>
    subscribe(IPC.sessionChanged, callback),
  onToast: (callback: (message: string) => void) => subscribe(IPC.toast, callback),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => subscribe(IPC.updateStatus, callback),
  onSteamImportProgress: (callback: (progress: SteamImportProgress) => void) =>
    subscribe(IPC.steamImportProgress, callback)
}

contextBridge.exposeInMainWorld("orca", api)

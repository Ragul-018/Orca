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
  UpdateGameInput,
  UpdateSettingsInput,
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
  setFavorite: (id: string, favorite: boolean) => ipcRenderer.invoke(IPC.setFavorite, id, favorite),
  launchGame: (id: string) => ipcRenderer.invoke(IPC.launchGame, id) as Promise<LaunchResult>,
  stopSession: () => ipcRenderer.invoke(IPC.stopSession),
  updateSettings: (input: UpdateSettingsInput) => ipcRenderer.invoke(IPC.updateSettings, input) as Promise<Settings>,
  chooseExecutable: () => ipcRenderer.invoke(IPC.chooseExecutable) as Promise<ExecutableChoice | null>,
  chooseFolder: () => ipcRenderer.invoke(IPC.chooseFolder) as Promise<string | null>,
  scanFolder: () => ipcRenderer.invoke(IPC.scanFolder),
  chooseArtwork: (kind: "cover" | "hero") => ipcRenderer.invoke(IPC.chooseArtwork, kind) as Promise<string | null>,
  fetchArtwork: (
    query: string,
    options?: { rawgApiKey?: string; igdbClientId?: string; igdbClientSecret?: string } | string
  ) => ipcRenderer.invoke(IPC.fetchArtwork, query, options) as Promise<ArtworkSearchResult>,
  importArtworkUrl: (url: string, kind: "cover" | "hero") =>
    ipcRenderer.invoke(IPC.importArtworkUrl, url, kind) as Promise<string | null>,
  revealGameFolder: (id: string) => ipcRenderer.invoke(IPC.revealGameFolder, id),
  exportBackup: () => ipcRenderer.invoke(IPC.exportBackup) as Promise<string | null>,
  openDataFolder: () => ipcRenderer.invoke(IPC.openDataFolder),
  windowAction: (action: WindowAction) => ipcRenderer.invoke(IPC.windowAction, action),
  onLibraryChanged: (callback: (snapshot: AppSnapshot) => void) => subscribe(IPC.libraryChanged, callback),
  onSessionChanged: (callback: (session: ActiveSession | null) => void) =>
    subscribe(IPC.sessionChanged, callback),
  onToast: (callback: (message: string) => void) => subscribe(IPC.toast, callback)
}

contextBridge.exposeInMainWorld("orca", api)

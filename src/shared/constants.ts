export const APP_NAME = 'Orca'
export const APP_ID = 'app.orca.launcher'
export const PROTOCOL = 'orca-art'
export const SCHEMA_VERSION = 2

export const IPC = {
  getSnapshot: 'app:get-snapshot',
  addGame: 'game:add',
  updateGame: 'game:update',
  removeGame: 'game:remove',
  reorderGames: 'game:reorder',
  setFavorite: 'game:set-favorite',
  launchGame: 'game:launch',
  stopSession: 'session:stop',
  updateSettings: 'settings:update',
  chooseExecutable: 'dialog:choose-executable',
  chooseFolder: 'dialog:choose-folder',
  scanFolder: 'scan:folder',
  scanSteamLibrary: 'steam:scan-library',
  importSteamGames: 'steam:import-games',
  chooseArtwork: 'dialog:choose-artwork',
  fetchArtwork: 'artwork:fetch',
  importArtworkUrl: 'artwork:import-url',
  revealGameFolder: 'game:reveal-folder',
  exportBackup: 'backup:export',
  restoreBackup: 'backup:restore',
  openDataFolder: 'app:open-data-folder',
  exportPlaytime: 'stats:export-playtime',
  windowAction: 'window:action',
  updateCheck: 'update:check',
  updateGetStatus: 'update:get-status',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  libraryChanged: 'event:library-changed',
  sessionChanged: 'event:session-changed',
  toast: 'event:toast',
  updateStatus: 'event:update-status',
  steamImportProgress: 'event:steam-import-progress'
} as const

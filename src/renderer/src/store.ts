import { create } from 'zustand'
import type {
  ActiveSession,
  AddGameInput,
  AppSnapshot,
  Game,
  SteamImportResult,
  UpdateGameInput,
  UpdateSettingsInput,
  UpdateStatus
} from '@shared/types'
import { cleanErrorMessage } from './lib/errors'
import { configureAudio, playSound } from './lib/audio'
import type { SoundName } from './lib/audio'

export type View =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'game'; gameId: string }

export interface Toast {
  id: string
  message: string
  tone: 'default' | 'success'
}

export interface ConfirmState {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  action: () => Promise<void> | void
}

interface AddGameModalState {
  open: boolean
  gameId: string | null
  startWithScan: boolean
}

interface OrcaStore {
  snapshot: AppSnapshot | null
  activeSession: ActiveSession | null
  stopping: boolean
  loading: boolean
  bootError: string | null
  view: View
  history: View[]
  addGameModal: AddGameModalState
  steamModalOpen: boolean
  controllerConnected: boolean
  searchOpen: boolean
  confirm: ConfirmState | null
  toasts: Toast[]
  updateStatus: UpdateStatus
  playSound: (name: SoundName) => void
  initialize: () => Promise<void>
  navigate: (view: View) => void
  goBack: () => void
  openGame: (gameId: string) => void
  openAddGame: (gameId?: string, startWithScan?: boolean) => void
  closeAddGame: () => void
  openSteamImport: () => void
  closeSteamImport: () => void
  setControllerConnected: (connected: boolean) => void
  importSteamGames: (appIds: number[]) => Promise<SteamImportResult | null>
  exportPlaytime: () => Promise<void>
  openSearch: () => void
  closeSearch: () => void
  addToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  requestConfirm: (state: ConfirmState) => void
  closeConfirm: () => void
  runConfirm: () => Promise<void>
  addGame: (input: AddGameInput) => Promise<Game | null>
  updateGame: (input: UpdateGameInput) => Promise<Game | null>
  removeGame: (id: string) => void
  reorderGames: (ids: string[]) => Promise<void>
  setFavorite: (id: string, favorite: boolean) => Promise<void>
  launchGame: (gameId: string) => Promise<void>
  stopActiveSession: () => void
  updateSettings: (input: UpdateSettingsInput) => Promise<void>
  exportBackup: () => Promise<void>
  restoreBackup: () => void
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  openDataFolder: () => Promise<void>
  revealGameFolder: (id: string) => Promise<void>
}

let initializing: Promise<void> | null = null

function viewsEqual(a: View, b: View): boolean {
  if (a.name !== b.name) return false
  if (a.name === 'game' && b.name === 'game') return a.gameId === b.gameId
  return true
}

export const useOrcaStore = create<OrcaStore>((set, get) => ({
  snapshot: null,
  activeSession: null,
  stopping: false,
  loading: true,
  bootError: null,
  view: { name: 'home' },
  history: [],
  addGameModal: { open: false, gameId: null, startWithScan: false },
  steamModalOpen: false,
  controllerConnected: false,
  searchOpen: false,
  confirm: null,
  toasts: [],
  updateStatus: { state: 'idle' },
  playSound: (name: SoundName) => playSound(name),

  initialize: async () => {
    if (initializing) return initializing
    initializing = (async () => {
      try {
        const snapshot = await window.orca.getSnapshot()
        configureAudio({
          enabled: snapshot.settings.soundEnabled,
          volume: snapshot.settings.soundVolume
        })
        set({
          snapshot,
          activeSession: snapshot.activeSession,
          loading: false,
          bootError: null
        })
      } catch (error) {
        set({ loading: false, bootError: cleanErrorMessage(error) })
        return
      }

      void window.orca
        .getUpdateStatus()
        .then((updateStatus) => set({ updateStatus }))
        .catch(() => undefined)

      window.orca.onUpdateStatus((status) => {
        const previous = get().updateStatus
        set({ updateStatus: status })
        if (status.state === 'ready' && previous.state !== 'ready') {
          get().addToast(
            `Orca ${status.version ?? ''} is ready. Restart to install.`.replace(/\s+/g, ' '),
            'success'
          )
          playSound('update')
        }
      })

      window.orca.onLibraryChanged((snapshot) => {
        set((state) => {
          const currentView = state.view
          if (
            currentView.name === 'game' &&
            !snapshot.games.some((game) => game.id === currentView.gameId)
          ) {
            return { snapshot, activeSession: snapshot.activeSession, view: { name: 'library' } }
          }
          return { snapshot, activeSession: snapshot.activeSession }
        })
      })

      window.orca.onSessionChanged((activeSession) => {
        set((state) => ({
          activeSession,
          stopping: activeSession ? state.stopping : false,
          snapshot: state.snapshot ? { ...state.snapshot, activeSession } : state.snapshot
        }))
      })

      window.orca.onToast((message) => {
        get().addToast(message, 'success')
      })
    })().finally(() => {
      initializing = null
    })
    return initializing
  },

  navigate: (view) => {
    const current = get().view
    if (viewsEqual(current, view)) return
    playSound('click')
    set((state) => ({
      view,
      history: [...state.history.filter((entry) => !viewsEqual(entry, view)), current].slice(-20),
      searchOpen: false
    }))
  },

  goBack: () => {
    const { history } = get()
    const previous = history[history.length - 1]
    if (!previous) {
      set({ view: { name: 'library' }, history: [] })
      return
    }
    set({ view: previous, history: history.slice(0, -1) })
  },

  openGame: (gameId) => {
    playSound('open')
    get().navigate({ name: 'game', gameId })
  },

  openAddGame: (gameId, startWithScan = false) => {
    playSound('open')
    set({ addGameModal: { open: true, gameId: gameId ?? null, startWithScan } })
  },

  closeAddGame: () => {
    playSound('close')
    set({ addGameModal: { open: false, gameId: null, startWithScan: false } })
  },

  openSteamImport: () => {
    playSound('open')
    set({ steamModalOpen: true, addGameModal: { open: false, gameId: null, startWithScan: false } })
  },

  closeSteamImport: () => {
    playSound('close')
    set({ steamModalOpen: false })
  },

  setControllerConnected: (connected) => set({ controllerConnected: connected }),

  importSteamGames: async (appIds) => {
    try {
      const result = await window.orca.importSteamGames(appIds)
      if (result.added > 0) {
        playSound('success')
        get().addToast(
          `${result.added} Steam ${result.added === 1 ? 'game' : 'games'} added to your library.`,
          'success'
        )
      }
      if (result.failed.length > 0) {
        get().addToast(
          `${result.failed.length} Steam ${result.failed.length === 1 ? 'game' : 'games'} could not be imported.`
        )
      }
      return result
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
      return null
    }
  },

  exportPlaytime: async () => {
    try {
      const path = await window.orca.exportPlaytime()
      if (path) {
        playSound('success')
        get().addToast('Playtime history exported.', 'success')
      }
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  openSearch: () => {
    playSound('open')
    set({ searchOpen: true })
  },
  closeSearch: () => {
    playSound('close')
    set({ searchOpen: false })
  },

  addToast: (message, tone = 'default') => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, tone }] }))
    window.setTimeout(() => get().dismissToast(id), 5_000)
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  requestConfirm: (confirm) => set({ confirm }),
  closeConfirm: () => set({ confirm: null }),

  runConfirm: async () => {
    const confirm = get().confirm
    if (!confirm) return
    try {
      await confirm.action()
      set({ confirm: null })
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
      set({ confirm: null })
    }
  },

  addGame: async (input) => {
    try {
      const game = await window.orca.addGame(input)
      playSound('success')
      get().addToast(`${game.title} joined your library.`, 'success')
      return game
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
      return null
    }
  },

  updateGame: async (input) => {
    try {
      const game = await window.orca.updateGame(input)
      playSound('success')
      return game
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
      return null
    }
  },

  removeGame: (id) => {
    const game = get().snapshot?.games.find((item) => item.id === id)
    if (!game) return
    get().requestConfirm({
      title: `Remove ${game.title}?`,
      message: 'The game will be removed from your library along with its recorded playtime. Your game files are not touched.',
      confirmLabel: 'Remove game',
      danger: true,
      action: async () => {
        await window.orca.removeGame(id)
        const currentView = get().view
        if (currentView.name === 'game' && currentView.gameId === id) {
          set({ view: { name: 'library' }, history: [] })
        }
        playSound('success')
        get().addToast(`${game.title} was removed.`)
      }
    })
  },

  setFavorite: async (id, favorite) => {
    try {
      playSound('toggle')
      await window.orca.setFavorite(id, favorite)
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  reorderGames: async (ids) => {
    const previous = get().snapshot
    if (!previous) return
    const byId = new Map(previous.games.map((game) => [game.id, game]))
    const ordered: Game[] = []
    for (const id of ids) {
      const game = byId.get(id)
      if (game) {
        ordered.push(game)
        byId.delete(id)
      }
    }
    ordered.push(...byId.values())
    set({ snapshot: { ...previous, games: ordered } })
    try {
      await window.orca.reorderGames(ids)
    } catch (error) {
      set({ snapshot: previous })
      get().addToast(cleanErrorMessage(error))
    }
  },

  launchGame: async (gameId) => {
    try {
      const result = await window.orca.launchGame(gameId)
      if (!result.ok) {
        playSound('error')
        get().addToast(result.error ?? 'The game could not be launched.')
        return
      }
      playSound('launch')
      if (result.activeSession) {
        set((state) => ({
          activeSession: result.activeSession ?? null,
          snapshot: state.snapshot ? { ...state.snapshot, activeSession: result.activeSession ?? null } : state.snapshot
        }))
      }
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  stopActiveSession: () => {
    const { activeSession, snapshot, stopping } = get()
    if (!activeSession || stopping) return
    const game = snapshot?.games.find((item) => item.id === activeSession.gameId)

    // The confirmation closes immediately; termination then runs in the
    // background so an elevation prompt or slow shutdown cannot leave the
    // dialog spinning forever.
    const stop = (): void => {
      set({ stopping: true })
      void (async () => {
        try {
          await window.orca.stopSession()
          playSound('close')
        } catch (error) {
          playSound('error')
          get().addToast(cleanErrorMessage(error))
        } finally {
          set({ stopping: false })
        }
      })()
    }

    if (!snapshot?.settings.confirmStopGame) {
      stop()
      return
    }

    get().requestConfirm({
      title: `Stop ${game?.title ?? 'this game'}?`,
      message: 'Orca will close the running game and finish this play session. Unsaved progress in the game may be lost.',
      confirmLabel: 'Stop game',
      danger: true,
      action: stop
    })
  },

  updateSettings: async (input) => {
    const previous = get().snapshot
    if (previous) {
      const settings = { ...previous.settings, ...input }
      set({ snapshot: { ...previous, settings } })
      if (input.soundEnabled !== undefined || input.soundVolume !== undefined) {
        configureAudio({ enabled: settings.soundEnabled, volume: settings.soundVolume })
      }
    }
    try {
      await window.orca.updateSettings(input)
    } catch (error) {
      set({ snapshot: previous })
      if (previous) {
        configureAudio({
          enabled: previous.settings.soundEnabled,
          volume: previous.settings.soundVolume
        })
      }
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  exportBackup: async () => {
    try {
      const path = await window.orca.exportBackup()
      if (path) {
        playSound('success')
        get().addToast('Backup exported.', 'success')
      }
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  restoreBackup: () => {
    get().requestConfirm({
      title: 'Restore a backup?',
      message:
        'This replaces your current library, play sessions, settings, and artwork with the contents of the backup file. Export a fresh backup first if you are unsure.',
      confirmLabel: 'Choose backup',
      danger: true,
      action: async () => {
        const restored = await window.orca.restoreBackup()
        if (!restored) return
        playSound('success')
        get().addToast('Backup restored.', 'success')
      }
    })
  },

  checkForUpdates: async () => {
    try {
      set({ updateStatus: { state: 'checking' } })
      const status = await window.orca.checkForUpdates()
      set({ updateStatus: status })
    } catch (error) {
      set({ updateStatus: { state: 'error', message: cleanErrorMessage(error) } })
      get().addToast(cleanErrorMessage(error))
    }
  },

  downloadUpdate: async () => {
    try {
      set({ updateStatus: { state: 'downloading', percent: 0 } })
      await window.orca.downloadUpdate()
    } catch (error) {
      set({ updateStatus: { state: 'error', message: cleanErrorMessage(error) } })
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  installUpdate: async () => {
    try {
      await window.orca.installUpdate()
    } catch (error) {
      playSound('error')
      get().addToast(cleanErrorMessage(error))
    }
  },

  openDataFolder: async () => {
    try {
      await window.orca.openDataFolder()
    } catch (error) {
      get().addToast(cleanErrorMessage(error))
    }
  },

  revealGameFolder: async (id) => {
    try {
      await window.orca.revealGameFolder(id)
    } catch (error) {
      get().addToast(cleanErrorMessage(error))
    }
  }
}))

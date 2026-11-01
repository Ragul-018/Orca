import { create } from 'zustand'
import type {
  ActiveSession,
  AddGameInput,
  AppSnapshot,
  Game,
  UpdateGameInput,
  UpdateSettingsInput
} from '@shared/types'
import { cleanErrorMessage } from './lib/errors'

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
  searchOpen: boolean
  confirm: ConfirmState | null
  toasts: Toast[]
  initialize: () => Promise<void>
  navigate: (view: View) => void
  goBack: () => void
  openGame: (gameId: string) => void
  openAddGame: (gameId?: string, startWithScan?: boolean) => void
  closeAddGame: () => void
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
  setFavorite: (id: string, favorite: boolean) => Promise<void>
  launchGame: (gameId: string) => Promise<void>
  stopActiveSession: () => void
  updateSettings: (input: UpdateSettingsInput) => Promise<void>
  exportBackup: () => Promise<void>
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
  searchOpen: false,
  confirm: null,
  toasts: [],

  initialize: async () => {
    if (initializing) return initializing
    initializing = (async () => {
      try {
        const snapshot = await window.orca.getSnapshot()
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
    get().navigate({ name: 'game', gameId })
  },

  openAddGame: (gameId, startWithScan = false) => {
    set({ addGameModal: { open: true, gameId: gameId ?? null, startWithScan } })
  },

  closeAddGame: () => {
    set({ addGameModal: { open: false, gameId: null, startWithScan: false } })
  },

  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),

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
      get().addToast(cleanErrorMessage(error))
      set({ confirm: null })
    }
  },

  addGame: async (input) => {
    try {
      const game = await window.orca.addGame(input)
      get().addToast(`${game.title} joined your library.`, 'success')
      return game
    } catch (error) {
      get().addToast(cleanErrorMessage(error))
      return null
    }
  },

  updateGame: async (input) => {
    try {
      return await window.orca.updateGame(input)
    } catch (error) {
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
        get().addToast(`${game.title} was removed.`)
      }
    })
  },

  setFavorite: async (id, favorite) => {
    try {
      await window.orca.setFavorite(id, favorite)
    } catch (error) {
      get().addToast(cleanErrorMessage(error))
    }
  },

  launchGame: async (gameId) => {
    try {
      const result = await window.orca.launchGame(gameId)
      if (!result.ok) {
        get().addToast(result.error ?? 'The game could not be launched.')
        return
      }
      if (result.activeSession) {
        set((state) => ({
          activeSession: result.activeSession ?? null,
          snapshot: state.snapshot ? { ...state.snapshot, activeSession: result.activeSession ?? null } : state.snapshot
        }))
      }
    } catch (error) {
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
        } catch (error) {
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
      set({ snapshot: { ...previous, settings: { ...previous.settings, ...input } } })
    }
    try {
      await window.orca.updateSettings(input)
    } catch (error) {
      set({ snapshot: previous })
      get().addToast(cleanErrorMessage(error))
    }
  },

  exportBackup: async () => {
    try {
      const path = await window.orca.exportBackup()
      if (path) get().addToast('Backup exported.', 'success')
    } catch (error) {
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

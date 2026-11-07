import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RotateCcw, XCircle, X } from 'lucide-react'
import { useOrcaStore } from './store'
import type { View } from './store'
import { TopBar } from './components/TopBar'
import { Toasts } from './components/Toasts'
import { SearchOverlay } from './components/SearchOverlay'
import { ConfirmDialog } from './components/ConfirmDialog'
import { AddGameModal } from './components/AddGameModal'
import { SteamImportModal } from './components/SteamImportModal'
import { GamepadLayer } from './components/GamepadLayer'
import { OrcaMark } from './components/Logo'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { GamePage } from './pages/GamePage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { primeAudio } from './lib/audio'

const APP_VERSION = '1.2.0'
const WHATS_NEW_KEY = `orca-whats-new-${APP_VERSION}`

function WhatsNewModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const playSound = useOrcaStore((state) => state.playSound)

  useEffect(() => {
    playSound('open')
  }, [playSound])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="whats-new-backdrop" role="presentation" onClick={onClose}>
      <div
        className="whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="whats-new-header">
          <h1 id="whats-new-title">What's new in Orca 1.2.0</h1>
          <button className="whats-new-close" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="whats-new-body">
          <section className="whats-new-section">
            <h2>Couch mode & controller support</h2>
            <p>
              Plug in a gamepad and Orca becomes a couch console. Move through the whole interface with the
              d-pad or stick, launch and stop games, favorite them, and switch tabs without touching the
              keyboard. Enable it in Settings → Gameplay.
            </p>
          </section>
          <section className="whats-new-section">
            <h2>Steam library import</h2>
            <p>
              Orca now reads your installed Steam games straight from <code>libraryfolders.vdf</code> and the
              app manifests. Pick what to bring over and Orca resolves the executable, downloads official
              Steam covers, and keeps everything local — no account or API key.
            </p>
          </section>
          <section className="whats-new-section">
            <h2>A simpler way to add games</h2>
            <p>
              The new add flow starts with three clear paths: choose an executable, scan a folder and add
              several games at once, or import your Steam shelf. Details, launch options, and artwork are
              tucked away until you need them.
            </p>
          </section>
          <section className="whats-new-section">
            <h2>The full playtime record</h2>
            <p>
              The Playtime tab now shows daily, weekly, and monthly rhythm, a 26-week heatmap, current and
              best streaks, time-of-day patterns, per-game breakdowns, and a complete filterable session
              history with CSV export.
            </p>
          </section>
        </div>
        <footer className="whats-new-footer">
          <button className="button button--primary" type="button" onClick={onClose} autoFocus>
            <XCircle size={16} /> Continue
          </button>
        </footer>
      </div>
    </div>
  )
}

function BootScreen(): React.JSX.Element {
  return (
    <div className="boot-screen" role="status" aria-label="Orca is starting">
      <div className="boot-screen__ambient" aria-hidden="true">
        <span className="boot-screen__ring boot-screen__ring--one" />
        <span className="boot-screen__ring boot-screen__ring--two" />
        <span className="boot-screen__ring boot-screen__ring--three" />
      </div>
      <div className="boot-screen__mark">
        <OrcaMark size={108} />
      </div>
      <span className="boot-screen__word">ORCA</span>
      <span className="boot-screen__hint">Descending into your library</span>
      <span className="boot-screen__loader" aria-hidden="true">
        <span />
      </span>
    </div>
  )
}

function BootError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="boot-error" role="alert">
      <div className="boot-error__panel">
        <span className="boot-error__icon">
          <AlertTriangle size={24} />
        </span>
        <span className="eyebrow">
          <span className="eyebrow__line" />
          Something surfaced wrong
        </span>
        <h1>Orca could not open your library.</h1>
        <p>{message}</p>
        <p className="boot-error__hint">
          Your data is stored locally. Check that the Orca data folder is writable, then try again.
        </p>
        <div className="boot-error__actions">
          <button className="button button--primary" type="button" onClick={() => window.location.reload()}>
            <RotateCcw size={16} /> Try again
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              void window.orca?.windowAction('quit')
            }}
          >
            <XCircle size={16} /> Quit Orca
          </button>
        </div>
      </div>
    </div>
  )
}

function renderView(view: View): React.JSX.Element {
  switch (view.name) {
    case 'home':
      return <HomePage />
    case 'library':
      return <LibraryPage />
    case 'stats':
      return <StatsPage />
    case 'settings':
      return <SettingsPage />
    case 'game':
      return <GamePage gameId={view.gameId} />
    default:
      return <LibraryPage />
  }
}

export function App(): React.JSX.Element {
  const loading = useOrcaStore((state) => state.loading)
  const bootError = useOrcaStore((state) => state.bootError)
  const snapshot = useOrcaStore((state) => state.snapshot)
  const view = useOrcaStore((state) => state.view)
  const history = useOrcaStore((state) => state.history)
  const modalOpen = useOrcaStore((state) => state.addGameModal.open)
  const steamModalOpen = useOrcaStore((state) => state.steamModalOpen)
  const searchOpen = useOrcaStore((state) => state.searchOpen)
  const couchMode = useOrcaStore((state) => state.snapshot?.settings.couchMode ?? false)
  const gamepadEnabled = useOrcaStore((state) => state.snapshot?.settings.gamepadEnabled ?? true)
  const initialize = useOrcaStore((state) => state.initialize)
  const openSearch = useOrcaStore((state) => state.openSearch)
  const closeSearch = useOrcaStore((state) => state.closeSearch)
  const goBack = useOrcaStore((state) => state.goBack)
  const playSound = useOrcaStore((state) => state.playSound)
  const settingsReduceMotion = useOrcaStore((state) => state.snapshot?.settings.reduceMotion ?? false)
  const mainRef = useRef<HTMLElement>(null)
  const [systemReduceMotion, setSystemReduceMotion] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [whatsNewChecked, setWhatsNewChecked] = useState(false)

  useEffect(() => {
    void initialize()
  }, [initialize])

  // Audio priming on first user gesture
  useEffect(() => {
    const prime = (): void => {
      primeAudio()
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
    window.addEventListener('pointerdown', prime)
    window.addEventListener('keydown', prime)
    return () => {
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown', prime)
    }
  }, [])

  // A single click cue for every interactive control. Specific actions layer
  // their own richer sounds on top; this keeps plain buttons from feeling dead.
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest('button, a[href], [role="switch"]')
      if (!control) return
      if (control.closest('.ps5-rail-card, .toggle')) return
      if ((control as HTMLButtonElement).disabled) return
      playSound('click')
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [playSound])

  // Reduce motion preference (system + in-app setting)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setSystemReduceMotion(query.matches)
    const handler = (event: MediaQueryListEvent): void => setSystemReduceMotion(event.matches)
    query.addEventListener?.('change', handler)
    return () => query.removeEventListener?.('change', handler)
  }, [])

  // What's New modal gate: only for returning libraries, so a brand-new
  // install goes straight to the empty state.
  useEffect(() => {
    if (!snapshot || whatsNewChecked) return
    setWhatsNewChecked(true)
    try {
      if (snapshot.games.length > 0 && !localStorage.getItem(WHATS_NEW_KEY)) setWhatsNewOpen(true)
    } catch {
      // Ignore storage errors
    }
  }, [snapshot, whatsNewChecked])

  const closeWhatsNew = (): void => {
    setWhatsNewOpen(false)
    try {
      localStorage.setItem(WHATS_NEW_KEY, 'seen')
    } catch {
      // Ignore storage errors
    }
  }

  // Apply reduce-motion class to document root
  useEffect(() => {
    if (typeof document === 'undefined') return
    const effective = systemReduceMotion || settingsReduceMotion
    if (effective) document.documentElement.classList.add('reduce-motion')
    else document.documentElement.classList.remove('reduce-motion')
  }, [systemReduceMotion, settingsReduceMotion])

  // Couch mode enlarges type, controls, and focus rings for a TV-sized view.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('couch-mode', couchMode)
  }, [couchMode])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [view, history.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (searchOpen) closeSearch()
        else openSearch()
        return
      }
      if (event.altKey && event.key === 'ArrowLeft' && view.name === 'game') {
        event.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSearch, goBack, openSearch, searchOpen, view.name])

  if (loading) return <BootScreen />
  if (bootError) return <BootError message={bootError} />
  if (!snapshot) return <BootError message="The library snapshot was empty." />

  const viewKey = view.name === 'game' ? `game-${view.gameId}` : view.name

  return (
    <div className="app">
      <TopBar />
      <main className="app-main" ref={mainRef}>
        <div className="app-main__stage" key={viewKey}>
          {renderView(view)}
        </div>
      </main>
      <SearchOverlay />
      <ConfirmDialog />
      {modalOpen && <AddGameModal />}
      {steamModalOpen && <SteamImportModal />}
      {gamepadEnabled && <GamepadLayer />}
      {whatsNewOpen && <WhatsNewModal onClose={closeWhatsNew} />}
      <Toasts />
    </div>
  )
}

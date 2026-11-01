import { useEffect, useRef } from 'react'
import { AlertTriangle, RotateCcw, XCircle } from 'lucide-react'
import { useOrcaStore } from './store'
import type { View } from './store'
import { TopBar } from './components/TopBar'
import { Toasts } from './components/Toasts'
import { SearchOverlay } from './components/SearchOverlay'
import { ConfirmDialog } from './components/ConfirmDialog'
import { AddGameModal } from './components/AddGameModal'
import { OrcaMark } from './components/Logo'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { GamePage } from './pages/GamePage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'

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
  const searchOpen = useOrcaStore((state) => state.searchOpen)
  const initialize = useOrcaStore((state) => state.initialize)
  const openSearch = useOrcaStore((state) => state.openSearch)
  const closeSearch = useOrcaStore((state) => state.closeSearch)
  const goBack = useOrcaStore((state) => state.goBack)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void initialize()
  }, [initialize])

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
      <Toasts />
    </div>
  )
}

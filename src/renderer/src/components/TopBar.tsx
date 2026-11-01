import { BarChart3, Home, LibraryBig, LoaderCircle, Search, Settings2, Square } from 'lucide-react'
import { formatDuration } from '@shared/format'
import { useOrcaStore } from '../store'
import { Logo } from './Logo'
import { WindowControls } from './WindowControls'

const NAV_ITEMS = [
  { name: 'home' as const, label: 'Home', icon: Home },
  { name: 'library' as const, label: 'Library', icon: LibraryBig },
  { name: 'stats' as const, label: 'Playtime', icon: BarChart3 }
]

export function TopBar(): React.JSX.Element {
  const view = useOrcaStore((state) => state.view)
  const navigate = useOrcaStore((state) => state.navigate)
  const openSearch = useOrcaStore((state) => state.openSearch)
  const active = useOrcaStore((state) => state.activeSession)
  const games = useOrcaStore((state) => state.snapshot?.games ?? [])
  const openGame = useOrcaStore((state) => state.openGame)
  const stopSession = useOrcaStore((state) => state.stopActiveSession)
  const stopping = useOrcaStore((state) => state.stopping)
  const activeGame = active ? games.find((game) => game.id === active.gameId) : null
  const activeTab = view.name === 'game' ? 'library' : view.name
  const overArt = view.name === 'home' || view.name === 'game'

  return (
    <header className={`topbar ${overArt ? 'topbar--over-art' : 'topbar--solid'}`}>
      <div className="topbar__left">
        <button className="logo-button" type="button" onClick={() => navigate({ name: 'home' })} aria-label="Orca home">
          <Logo />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const selected = activeTab === item.name
            return (
              <button
                key={item.name}
                type="button"
                className={`main-nav__item ${selected ? 'is-active' : ''}`}
                onClick={() => navigate({ name: item.name })}
                aria-current={selected ? 'page' : undefined}
              >
                <Icon size={16} strokeWidth={1.8} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="topbar__right">
        {active && activeGame && (
          <div className="running-chip">
            <button className="running-chip__main" type="button" onClick={() => openGame(activeGame.id)}>
              <span className="running-chip__pulse" />
              <span className="running-chip__name">{activeGame.title}</span>
              <span className="running-chip__time">
                {formatDuration(active.elapsedMs, { compact: true, includeSeconds: true })}
              </span>
            </button>
            <button
              className={`running-chip__stop ${stopping ? 'is-stopping' : ''}`}
              type="button"
              title={stopping ? 'Stopping game…' : 'Stop game'}
              aria-label={stopping ? `Stopping ${activeGame.title}` : `Stop ${activeGame.title}`}
              onClick={stopSession}
              disabled={stopping}
            >
              {stopping ? (
                <LoaderCircle size={11} className="spin" />
              ) : (
                <Square size={10} fill="currentColor" />
              )}
            </button>
          </div>
        )}

        <button className="icon-button search-trigger" type="button" onClick={openSearch} aria-label="Search games">
          <Search size={17} strokeWidth={1.8} />
          <span className="search-trigger__label">Search</span>
          <kbd>Ctrl K</kbd>
        </button>

        <button
          className={`icon-button ${view.name === 'settings' ? 'is-active' : ''}`}
          type="button"
          onClick={() => navigate({ name: 'settings' })}
          aria-label="Settings"
        >
          <Settings2 size={17} strokeWidth={1.8} />
        </button>

        <WindowControls />
      </div>
    </header>
  )
}

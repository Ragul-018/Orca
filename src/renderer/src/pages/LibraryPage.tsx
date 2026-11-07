import { useDeferredValue, useMemo, useState } from 'react'
import { FolderSearch, Gamepad2, Plus, Search, X } from 'lucide-react'
import type { GameStatus } from '@shared/types'
import { useOrcaStore } from '../store'
import { EmptyLibrary } from '../components/EmptyLibrary'
import { GameCard } from '../components/GameCard'

type Filter = 'all' | 'favorites' | 'playing' | 'unplayed' | 'completed' | 'on-hold'
type Sort = 'recent' | 'title' | 'playtime' | 'added'

const FILTERS: { id: Filter; label: string; status?: GameStatus }[] = [
  { id: 'all', label: 'All games' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'playing', label: 'Playing', status: 'playing' },
  { id: 'unplayed', label: 'Unplayed', status: 'unplayed' },
  { id: 'completed', label: 'Completed', status: 'completed' },
  { id: 'on-hold', label: 'On hold', status: 'on-hold' }
]

const SORT_LABELS: Record<Sort, string> = {
  recent: 'Recently played',
  title: 'A–Z',
  playtime: 'Most played',
  added: 'Recently added'
}

export function LibraryPage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const active = useOrcaStore((state) => state.activeSession)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const openSteamImport = useOrcaStore((state) => state.openSteamImport)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('recent')
  const deferredQuery = useDeferredValue(query)

  const games = useMemo(() => {
    if (!snapshot) return []
    let list = snapshot.games.filter((game) => !game.hidden)
    const selectedFilter = FILTERS.find((item) => item.id === filter)
    if (filter === 'favorites') list = list.filter((game) => game.favorite)
    else if (filter === 'playing') {
      list = list.filter((game) => game.status === 'playing' || active?.gameId === game.id)
    } else if (selectedFilter?.status) {
      list = list.filter((game) => game.status === selectedFilter.status)
    }

    const normalizedQuery = deferredQuery.trim().toLowerCase()
    if (normalizedQuery) {
      list = list.filter((game) =>
        [game.title, game.developer, ...game.genres, ...game.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    }

    return [...list].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'playtime') return b.playtimeMs - a.playtimeMs
      if (sort === 'added') return Date.parse(b.addedAt) - Date.parse(a.addedAt)
      const aDate = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
      const bDate = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
      return bDate - aDate || Date.parse(b.addedAt) - Date.parse(a.addedAt)
    })
  }, [snapshot, filter, deferredQuery, sort, active?.gameId])

  if (!snapshot) return <></>
  const totalGames = snapshot.games.filter((game) => !game.hidden).length

  return (
    <div className="page library-page page-enter">
      <header className="page-header library-header">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__line" />
            The collection
          </span>
          <h1>Library</h1>
          <p className="page-header__subtitle">
            {totalGames} {totalGames === 1 ? 'game' : 'games'} in your collection
            {active ? ' · one currently in play' : ''}
          </p>
        </div>
        <div className="page-header__actions">
          <button className="button button--glass" type="button" onClick={openSteamImport}>
            <Gamepad2 size={16} />
            Import Steam
          </button>
          <button className="button button--glass" type="button" onClick={() => openAddGame(undefined, true)}>
            <FolderSearch size={16} />
            Scan folder
          </button>
          <button className="button button--primary" type="button" onClick={() => openAddGame()}>
            <Plus size={17} />
            Add game
          </button>
        </div>
      </header>

      {totalGames === 0 ? (
        <EmptyLibrary variant="library" />
      ) : (
        <>
          <div className="library-toolbar">
            <div className="filter-chips" role="tablist" aria-label="Filter library">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === item.id}
                  className={`filter-chip ${filter === item.id ? 'is-active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="library-tools">
              <label className="search-field">
                <Search size={15} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search games"
                  aria-label="Search library"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={13} />
                  </button>
                )}
              </label>
              <label className="sort-field">
                <span>Sort</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
                  {Object.entries(SORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {games.length > 0 ? (
            <div className="game-grid">
              {games.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  showPlaytime={snapshot.settings.showPlaytimeOnCards}
                  anotherGameRunning={Boolean(active)}
                />
              ))}
              <button className="add-game-tile" type="button" onClick={() => openAddGame()}>
                <span className="add-game-tile__plus">
                  <Plus size={22} />
                </span>
                <span>
                  <strong>Add another game</strong>
                  <small>EXE, shortcut, or folder scan</small>
                </span>
              </button>
            </div>
          ) : (
            <div className="library-empty-results">
              <Search size={22} />
              <h2>No games surface here.</h2>
              <p>Try another search or filter.</p>
              <button
                className="button button--glass"
                type="button"
                onClick={() => {
                  setQuery('')
                  setFilter('all')
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

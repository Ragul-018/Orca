import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CornerDownLeft, Plus, Search, X } from 'lucide-react'
import { useOrcaStore } from '../store'
import { CoverArtwork } from './GameArtwork'

export function SearchOverlay(): React.JSX.Element {
  const open = useOrcaStore((state) => state.searchOpen)
  const close = useOrcaStore((state) => state.closeSearch)
  const openGame = useOrcaStore((state) => state.openGame)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const games = useOrcaStore((state) => state.snapshot?.games ?? [])
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const results = useMemo(() => {
    const visible = games.filter((game) => !game.hidden)
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return [...visible]
        .sort((a, b) => {
          const aDate = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0
          const bDate = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0
          return bDate - aDate || a.title.localeCompare(b.title)
        })
        .slice(0, 7)
    }

    const scored = visible
      .map((game) => {
        const title = game.title.toLowerCase()
        const developer = game.developer.toLowerCase()
        const genres = game.genres.join(' ').toLowerCase()
        const tags = game.tags.join(' ').toLowerCase()
        let score = 0
        if (title === normalized) score = 100
        else if (title.startsWith(normalized)) score = 80
        else if (title.includes(normalized)) score = 60
        else if (developer.includes(normalized)) score = 40
        else if (genres.includes(normalized) || tags.includes(normalized)) score = 25
        return { game, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title))
      .slice(0, 7)

    return scored.map((entry) => entry.game)
  }, [games, query])

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, open])

  const choose = (gameId: string): void => {
    close()
    openGame(gameId)
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((index) => (results.length ? (index + 1) % results.length : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((index) => (results.length ? (index - 1 + results.length) % results.length : 0))
      return
    }
    if (event.key === 'Enter') {
      const game = results[highlighted]
      if (game) {
        event.preventDefault()
        choose(game.id)
      }
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="search-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <motion.section
            className="search-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search your library"
            initial={{ opacity: 0, y: -18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="search-panel__field">
              <Search size={19} strokeWidth={1.8} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search games, genres, studios…"
                aria-label="Search games"
                spellCheck={false}
              />
              {query ? (
                <button className="search-panel__clear" type="button" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={15} />
                </button>
              ) : (
                <kbd className="search-panel__esc">Esc</kbd>
              )}
            </div>

            <div className="search-panel__results" role="listbox" aria-label="Search results">
              {results.length > 0 ? (
                results.map((game, index) => (
                  <button
                    key={game.id}
                    className={`search-result ${index === highlighted ? 'is-highlighted' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={index === highlighted}
                    onMouseEnter={() => setHighlighted(index)}
                    onClick={() => choose(game.id)}
                  >
                    <span className="search-result__art">
                      <CoverArtwork game={game} />
                    </span>
                    <span className="search-result__info">
                      <strong>{game.title}</strong>
                      <small>
                        {[game.developer, game.genres[0], game.releaseYear].filter(Boolean).join(' · ') ||
                          'In your library'}
                      </small>
                    </span>
                    <span className="search-result__open">
                      {index === highlighted ? <CornerDownLeft size={15} /> : <ArrowRight size={15} />}
                    </span>
                  </button>
                ))
              ) : (
                <div className="search-panel__empty">
                  <span className="search-panel__empty-mark">
                    <Search size={22} />
                  </span>
                  <strong>No games surface here.</strong>
                  <p>Try a different title, studio, or genre.</p>
                  <button
                    className="button button--glass button--small"
                    type="button"
                    onClick={() => {
                      close()
                      openAddGame()
                    }}
                  >
                    <Plus size={14} /> Add a game
                  </button>
                </div>
              )}
            </div>

            <footer className="search-panel__footer">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to move
              </span>
              <span>
                <kbd>Enter</kbd> to open
              </span>
              <span className="search-panel__count">
                {query.trim()
                  ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
                  : `${games.filter((game) => !game.hidden).length} games in your library`}
              </span>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

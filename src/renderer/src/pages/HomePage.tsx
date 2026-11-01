import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Clock3,
  Heart,
  Play,
  Plus,
  Radio,
  Square,
  Trophy
} from 'lucide-react'
import type { Game } from '@shared/types'
import {
  formatPlaytime,
  formatRelativeDate,
  pluralize
} from '@shared/format'
import { useOrcaStore } from '../store'
import { EmptyLibrary } from '../components/EmptyLibrary'
import { HeroArtwork, CoverArtwork } from '../components/GameArtwork'
import { WeekChart } from '../components/WeekChart'
import { computeWeek, totalPlaytime } from '../lib/visual'

type GridFilter = 'all' | 'favorites' | 'playing'

export function HomePage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const active = useOrcaStore((state) => state.activeSession)
  const navigate = useOrcaStore((state) => state.navigate)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const launchGame = useOrcaStore((state) => state.launchGame)
  const stopSession = useOrcaStore((state) => state.stopActiveSession)
  const setFavorite = useOrcaStore((state) => state.setFavorite)

  const visibleGames = snapshot?.games.filter((game) => !game.hidden) ?? []
  const [filter, setFilter] = useState<GridFilter>('all')

  // Selected game for the top ambient hero showcase
  const [selectedId, setSelectedId] = useState<string>(() => {
    return active?.gameId ?? visibleGames[0]?.id ?? ''
  })

  // Sync if active session starts
  useEffect(() => {
    if (active?.gameId) {
      setSelectedId(active.gameId)
    }
  }, [active?.gameId])

  // Sync if selection is missing
  useEffect(() => {
    if (!visibleGames.some((g) => g.id === selectedId) && visibleGames[0]) {
      setSelectedId(visibleGames[0].id)
    }
  }, [visibleGames, selectedId])

  if (!snapshot) return <></>
  if (visibleGames.length === 0) return <EmptyLibrary variant="home" />

  const focusedGame: Game = visibleGames.find((g) => g.id === selectedId) ?? visibleGames[0]
  const isGameRunning = active?.gameId === focusedGame.id
  const anotherGameRunning = Boolean(active && !isGameRunning)

  // Filter games for the grid
  const filteredGames = visibleGames.filter((game) => {
    if (filter === 'favorites') return game.favorite
    if (filter === 'playing') return game.id === active?.gameId || game.status === 'playing'
    return true
  })

  const weekly = computeWeek(snapshot.sessions, 7)
  const totalMs = totalPlaytime(visibleGames)
  const metaItems = [focusedGame.developer, focusedGame.releaseYear, focusedGame.genres[0]].filter(Boolean)

  // Arrow key and Enter navigation across the grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (filteredGames.length === 0) return
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return

      const currentIndex = filteredGames.findIndex((g) => g.id === selectedId)
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next = (currentIndex + 1) % filteredGames.length
        setSelectedId(filteredGames[next].id)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const prev = (currentIndex - 1 + filteredGames.length) % filteredGames.length
        setSelectedId(filteredGames[prev].id)
      } else if (e.key === 'Enter') {
        if (target === document.body || target?.classList.contains('ps5-game-grid-card')) {
          e.preventDefault()
          void launchGame(focusedGame.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredGames, selectedId, focusedGame.id, launchGame])

  return (
    <div className="home-page ps5-grid-dashboard page-enter">
      {/* Dynamic Ambient Full-screen Wallpaper */}
      <div className="ps5-ambient-backdrop" key={focusedGame.id}>
        <HeroArtwork game={focusedGame} className="ps5-ambient-backdrop__art" eager />
        <div className="ps5-ambient-backdrop__overlay" />
      </div>

      <div className="ps5-dashboard-content">
        {/* Top Showcase Banner */}
        <section className="ps5-showcase-banner">
          <div className="ps5-showcase-banner__info">
            <div className="ps5-status-tag">
              <span className="ps5-pill-badge">PC</span>
              {isGameRunning ? (
                <span className="ps5-live-badge">
                  <Radio size={12} className="spin" /> PLAYING NOW
                </span>
              ) : focusedGame.lastPlayedAt ? (
                <span className="ps5-ready-badge">READY TO RESUME</span>
              ) : (
                <span className="ps5-ready-badge">READY TO PLAY</span>
              )}
            </div>

            <h1 className="ps5-showcase-title">{focusedGame.title}</h1>

            <div className="ps5-game-meta">
              {metaItems.map((item) => (
                <span key={item} className="ps5-meta-item">
                  {item}
                </span>
              ))}
              {focusedGame.rating && (
                <span className="ps5-meta-rating">★ {focusedGame.rating}.0</span>
              )}
            </div>

            {focusedGame.description && (
              <p className="ps5-showcase-description">{focusedGame.description}</p>
            )}

            <div className="ps5-actions">
              {isGameRunning ? (
                <button
                  className="button button--stop button--large ps5-play-btn"
                  type="button"
                  onClick={stopSession}
                >
                  <Square size={16} fill="currentColor" />
                  Quit Game
                </button>
              ) : (
                <button
                  className="button button--primary button--large ps5-play-btn"
                  type="button"
                  disabled={anotherGameRunning}
                  onClick={() => void launchGame(focusedGame.id)}
                >
                  <Play size={18} fill="currentColor" />
                  Play Game
                </button>
              )}

              <button
                className="button button--glass button--large"
                type="button"
                onClick={() => navigate({ name: 'game', gameId: focusedGame.id })}
              >
                Game Details
                <ArrowRight size={16} />
              </button>

              <button
                className={`round-button ${focusedGame.favorite ? 'is-active' : ''}`}
                type="button"
                aria-label={focusedGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
                title={focusedGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
                onClick={() => void setFavorite(focusedGame.id, !focusedGame.favorite)}
              >
                <Heart size={18} fill={focusedGame.favorite ? 'currentColor' : 'none'} />
              </button>
            </div>

            {anotherGameRunning && active && (
              <p className="ps5-running-notice">
                Another game is running. Stop it from the status bar to switch.
              </p>
            )}
          </div>

          {/* Quick Stats on Banner Right */}
          <div className="ps5-showcase-banner__stats">
            <div className="ps5-banner-stat">
              <span className="ps5-banner-stat__label">Playtime</span>
              <strong className="ps5-banner-stat__value">
                {focusedGame.playtimeMs > 0 ? formatPlaytime(focusedGame.playtimeMs) : '0 hours'}
              </strong>
              <small className="ps5-banner-stat__sub">
                {focusedGame.lastPlayedAt
                  ? `Last played ${formatRelativeDate(focusedGame.lastPlayedAt)}`
                  : 'Never launched'}
              </small>
            </div>
            <div className="ps5-banner-stat">
              <span className="ps5-banner-stat__label">Sessions</span>
              <strong className="ps5-banner-stat__value">
                {focusedGame.sessionCount}
              </strong>
              <small className="ps5-banner-stat__sub">
                {focusedGame.status.toUpperCase()}
              </small>
            </div>
          </div>
        </section>

        {/* The PlayStation Game Grid System */}
        <section className="ps5-grid-section">
          <div className="ps5-grid-toolbar">
            <div className="ps5-grid-toolbar__left">
              <h2>Library</h2>
              <span className="ps5-grid-count">{visibleGames.length} {pluralize(visibleGames.length, 'game')}</span>
            </div>

            <div className="filter-chips">
              <button
                className={`filter-chip ${filter === 'all' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setFilter('all')}
              >
                All Games
              </button>
              <button
                className={`filter-chip ${filter === 'favorites' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setFilter('favorites')}
              >
                Favorites
              </button>
              <button
                className={`filter-chip ${filter === 'playing' ? 'is-active' : ''}`}
                type="button"
                onClick={() => setFilter('playing')}
              >
                Playing
              </button>
            </div>

            <button
              className="button button--glass button--sm"
              type="button"
              onClick={() => openAddGame()}
            >
              <Plus size={14} /> Add Game
            </button>
          </div>

          {/* Structured CSS Grid */}
          <div className="ps5-games-grid">
            {filteredGames.map((game) => {
              const isSelected = game.id === focusedGame.id
              const isPlaying = active?.gameId === game.id

              return (
                <article
                  key={game.id}
                  className={`ps5-game-grid-card ${isSelected ? 'is-selected' : ''} ${isPlaying ? 'is-playing' : ''}`}
                  onClick={() => setSelectedId(game.id)}
                  onDoubleClick={() => void launchGame(game.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select ${game.title}`}
                >
                  <div className="ps5-game-grid-card__cover">
                    <CoverArtwork game={game} />
                    <span className="ps5-game-grid-card__glow" />

                    {game.favorite && (
                      <span className="ps5-game-grid-card__favorite">
                        <Heart size={12} fill="currentColor" />
                      </span>
                    )}

                    {isPlaying && (
                      <span className="ps5-game-grid-card__live">
                        <span className="pulse-dot" /> Live
                      </span>
                    )}

                    <button
                      className="ps5-game-grid-card__play"
                      type="button"
                      title={`Play ${game.title}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void launchGame(game.id)
                      }}
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                  </div>

                  <div className="ps5-game-grid-card__meta">
                    <strong className="ps5-game-grid-card__title">{game.title}</strong>
                    <div className="ps5-game-grid-card__sub">
                      <span>{game.developer || game.genres[0] || 'Game'}</span>
                      {game.playtimeMs > 0 && (
                        <span className="ps5-playtime-tag">{formatPlaytime(game.playtimeMs)}</span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}

            {/* Quick Add Game Card in Grid */}
            <button
              className="ps5-game-grid-card ps5-game-grid-card--add"
              type="button"
              onClick={() => openAddGame()}
            >
              <div className="ps5-game-grid-card__cover ps5-game-grid-card__cover--add">
                <Plus size={36} />
                <span>Add Game</span>
              </div>
              <div className="ps5-game-grid-card__meta">
                <strong className="ps5-game-grid-card__title" style={{ opacity: 0.6 }}>Add to library</strong>
                <span className="ps5-game-grid-card__sub" style={{ opacity: 0.4 }}>Folder or file</span>
              </div>
            </button>
          </div>
        </section>

        {/* Dashboard Footer Rhythm */}
        <section className="home-dashboard" style={{ marginTop: '40px' }}>
          <div className="panel home-week">
            <div className="panel__heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" />
                  Rhythm
                </span>
                <h2>This week in play</h2>
              </div>
              <Clock3 size={18} className="panel__icon" />
            </div>
            <WeekChart days={weekly} />
          </div>

          <div className="panel home-collection">
            <div className="panel__heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" />
                  Overview
                </span>
                <h2>Library metrics</h2>
              </div>
              <Trophy size={18} className="panel__icon" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '10px 0' }}>
              <div className="panel" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.5)' }}>Total Games</span>
                <strong style={{ display: 'block', fontSize: '26px', color: '#fff', marginTop: '4px' }}>{visibleGames.length}</strong>
              </div>
              <div className="panel" style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.5)' }}>Total Playtime</span>
                <strong style={{ display: 'block', fontSize: '26px', color: '#2dd4bf', marginTop: '4px' }}>
                  {totalMs > 0 ? `${Math.round(totalMs / 3_600_000)}h` : '0h'}
                </strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Heart,
  LibraryBig,
  LoaderCircle,
  Play,
  Plus,
  Radio,
  Sparkles,
  Square,
  Star
} from 'lucide-react'
import type { Game } from '@shared/types'
import { formatPlaytime, formatRelativeDate } from '@shared/format'
import { useOrcaStore } from '../store'
import { EmptyLibrary } from '../components/EmptyLibrary'
import { CoverArtwork, HeroArtwork } from '../components/GameArtwork'
import { WeekChart } from '../components/WeekChart'
import { computeWeek, totalPlaytime } from '../lib/visual'
import navSoundUrl from '../assets/playstation.mp3'

export function HomePage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const active = useOrcaStore((state) => state.activeSession)
  const navigate = useOrcaStore((state) => state.navigate)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const launchGame = useOrcaStore((state) => state.launchGame)
  const stopSession = useOrcaStore((state) => state.stopActiveSession)
  const stopping = useOrcaStore((state) => state.stopping)
  const setFavorite = useOrcaStore((state) => state.setFavorite)

  const visibleGames = useMemo(() => snapshot?.games.filter((game) => !game.hidden) ?? [], [snapshot])
  const [selectedId, setSelectedId] = useState(
    () => active?.gameId ?? visibleGames[0]?.id ?? ''
  )
  const railRef = useRef<HTMLDivElement>(null)

  // Play navigation sound - creates a new instance each time for instant replay
  const playNavSound = (): void => {
    const sound = new Audio(navSoundUrl)
    sound.volume = 0.3
    sound.play().catch(() => {})
  }

  const focusedGame: Game | undefined =
    visibleGames.find((game) => game.id === selectedId) ?? visibleGames[0]
  const isGameRunning = Boolean(active && focusedGame && active.gameId === focusedGame.id)
  const anotherGameRunning = Boolean(active && focusedGame && !isGameRunning)

  const weekly = useMemo(() => computeWeek(snapshot?.sessions ?? [], 7), [snapshot?.sessions])
  const weekTotal = weekly.reduce((total, day) => total + day.ms, 0)
  const totalMs = totalPlaytime(visibleGames)
  const completedCount = visibleGames.filter((game) => game.status === 'completed').length
  const backlogCount = visibleGames.filter((game) => game.status === 'unplayed').length
  const favoriteCount = visibleGames.filter((game) => game.favorite).length
  const backlogProgress = visibleGames.length > 0 ? completedCount / visibleGames.length : 0

  // Keep the selection valid as games are added, removed, or launched.
  useEffect(() => {
    if (visibleGames.length === 0) {
      if (selectedId) setSelectedId('')
      return
    }
    const selectedExists = visibleGames.some((game) => game.id === selectedId)
    if (!selectedExists) {
      const preferred = active?.gameId && visibleGames.some((game) => game.id === active.gameId)
        ? active.gameId
        : visibleGames[0].id
      setSelectedId(preferred)
    }
  }, [active?.gameId, selectedId, visibleGames])

  // Launching a game from anywhere should bring its tile into view.
  useEffect(() => {
    if (!active?.gameId) return
    if (visibleGames.some((game) => game.id === active.gameId)) setSelectedId(active.gameId)
  }, [active?.gameId, visibleGames])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || !selectedId) return
    const tile = [...rail.querySelectorAll<HTMLElement>('[data-game-id]')].find(
      (node) => node.dataset.gameId === selectedId
    )
    tile?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (visibleGames.length === 0) return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
      ) {
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return

      const currentIndex = Math.max(
        0,
        visibleGames.findIndex((game) => game.id === focusedGame?.id)
      )

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedId(visibleGames[(currentIndex + 1) % visibleGames.length].id)
        playNavSound()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedId(visibleGames[(currentIndex - 1 + visibleGames.length) % visibleGames.length].id)
        playNavSound()
        return
      }
      if (event.key === 'Enter' && focusedGame && !anotherGameRunning) {
        const interactive = target?.closest('button, a, input, select, textarea')
        if (!interactive || target === document.body) {
          event.preventDefault()
          if (isGameRunning) stopSession()
          else void launchGame(focusedGame.id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    anotherGameRunning,
    focusedGame,
    isGameRunning,
    launchGame,
    stopSession,
    visibleGames
  ])

  if (!snapshot) return <></>
  if (visibleGames.length === 0 || !focusedGame) return <EmptyLibrary variant="home" />

  const metaItems = [focusedGame.developer, focusedGame.releaseYear, focusedGame.genres[0]].filter(
    Boolean
  )

  return (
    <div className="ps5-home page-enter">
      <div className="ps5-home__backdrop" key={focusedGame.id}>
        <HeroArtwork game={focusedGame} className="ps5-home__backdrop-art" eager />
        <div className="ps5-home__scrim" />
      </div>

      <header className="ps5-home__shelf">
        <div className="ps5-home__shelf-heading">
          <span className="ps5-home__shelf-label">
            <span className="ps5-home__shelf-mark" />
            Your library
          </span>
          <span className="ps5-home__shelf-count">
            {visibleGames.length} {visibleGames.length === 1 ? 'game' : 'games'}
          </span>
        </div>

        <div className="ps5-rail" ref={railRef} role="listbox" aria-label="Choose a game">
          {visibleGames.map((game) => {
            const selected = game.id === focusedGame.id
            const playing = active?.gameId === game.id
            return (
              <button
                key={game.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`ps5-rail-card ${selected ? 'is-selected' : ''} ${
                  playing ? 'is-playing' : ''
                }`}
                data-game-id={game.id}
                title={game.title}
                onClick={() => setSelectedId(game.id)}
                onDoubleClick={() => void launchGame(game.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  if (selected && !anotherGameRunning) {
                    if (playing) stopSession()
                    else void launchGame(game.id)
                  } else {
                    setSelectedId(game.id)
                  }
                }}
              >
                <span className="ps5-rail-card__art">
                  <CoverArtwork game={game} eager={selected} />
                  <span className="ps5-rail-card__sheen" />
                  {game.favorite && (
                    <span className="ps5-rail-card__favorite" aria-label="Favorite">
                      <Heart size={10} fill="currentColor" />
                    </span>
                  )}
                  {playing && (
                    <span className="ps5-rail-card__live" aria-label="Running">
                      <span className="pulse-dot" />
                    </span>
                  )}
                </span>
                <span className="ps5-rail-card__title">{game.title}</span>
              </button>
            )
          })}

          <button
            type="button"
            className="ps5-rail-card ps5-rail-card--add"
            onClick={() => openAddGame()}
            title="Add a game"
          >
            <span className="ps5-rail-card__art">
              <Plus size={22} />
            </span>
            <span className="ps5-rail-card__title">Add game</span>
          </button>
        </div>
      </header>

      <main className="ps5-home__stage">
        <section className="ps5-home__hero" key={focusedGame.id}>
          <div className="ps5-home__status">
            <span className="ps5-home__platform">PC</span>
            {isGameRunning ? (
              <span className="ps5-home__live">
                <Radio size={11} className="spin" />
                Playing now
              </span>
            ) : (
              <span className="ps5-home__state">
                {focusedGame.lastPlayedAt ? 'Ready to resume' : 'Ready to play'}
              </span>
            )}
            {focusedGame.rating !== null && focusedGame.rating > 0 && (
              <span className="ps5-home__rating" aria-label={`${focusedGame.rating} out of 5 stars`}>
                <Star size={12} fill="currentColor" />
                {focusedGame.rating}.0
              </span>
            )}
          </div>

          <h1 className="ps5-home__title">{focusedGame.title}</h1>

          <div className="ps5-home__meta">
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {focusedGame.playtimeMs > 0 && <span>{formatPlaytime(focusedGame.playtimeMs)} played</span>}
          </div>

          {focusedGame.description && (
            <p className="ps5-home__description">{focusedGame.description}</p>
          )}

          <div className="ps5-home__actions">
            {isGameRunning ? (
              <button
                className="button button--stop button--large ps5-home__play"
                type="button"
                onClick={stopSession}
                disabled={stopping}
              >
                {stopping ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Square size={14} fill="currentColor" />
                )}
                {stopping ? 'Stopping…' : 'Stop game'}
              </button>
            ) : (
              <button
                className="button button--primary button--large ps5-home__play"
                type="button"
                disabled={anotherGameRunning}
                onClick={() => void launchGame(focusedGame.id)}
              >
                <Play size={17} fill="currentColor" />
                {focusedGame.lastPlayedAt ? 'Resume game' : 'Play game'}
              </button>
            )}

            <button
              className="button button--glass button--large"
              type="button"
              onClick={() => navigate({ name: 'game', gameId: focusedGame.id })}
            >
              Game details
              <ArrowRight size={16} />
            </button>

            <button
              className={`round-button ${focusedGame.favorite ? 'is-active' : ''}`}
              type="button"
              aria-label={focusedGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
              title={focusedGame.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => void setFavorite(focusedGame.id, !focusedGame.favorite)}
            >
              <Heart size={17} fill={focusedGame.favorite ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="ps5-home__statusline">
            {anotherGameRunning && active ? (
              <span className="ps5-home__notice">
                Another game is running. Stop it from the status bar before switching.
              </span>
            ) : focusedGame.lastPlayedAt ? (
              <span>Last played {formatRelativeDate(focusedGame.lastPlayedAt)}</span>
            ) : (
              <span>First descent — the clock starts when you play.</span>
            )}
          </div>
        </section>

        <aside className="ps5-home__panels" aria-label="Library at a glance">
          <section className="ps5-panel ps5-panel--week">
            <header className="ps5-panel__head">
              <span>This week</span>
              <Clock3 size={13} />
            </header>
            <WeekChart days={weekly} variant="compact" />
            <div className="ps5-panel__foot">
              <strong>{weekTotal > 0 ? formatPlaytime(weekTotal) : 'Quiet week'}</strong>
              <span>{weekTotal > 0 ? 'played' : 'so far'}</span>
            </div>
          </section>

          <section className="ps5-panel ps5-panel--collection">
            <header className="ps5-panel__head">
              <span>Collection</span>
              <LibraryBig size={13} />
            </header>
            <div className="ps5-panel__metric">
              <strong>{visibleGames.length}</strong>
              <span>{visibleGames.length === 1 ? 'game' : 'games'}</span>
            </div>
            <div className="ps5-panel__foot">
              <strong>{totalMs > 0 ? formatPlaytime(totalMs) : '0 hrs'}</strong>
              <span>total playtime</span>
            </div>
          </section>

          <section className="ps5-panel ps5-panel--progress">
            <header className="ps5-panel__head">
              <span>Progress</span>
              <CheckCircle2 size={13} />
            </header>
            <div className="ps5-panel__metric">
              <strong>{backlogCount}</strong>
              <span>in the backlog</span>
            </div>
            <div
              className="ps5-panel__progress"
              role="progressbar"
              aria-label="Games completed"
              aria-valuemin={0}
              aria-valuemax={visibleGames.length}
              aria-valuenow={completedCount}
            >
              <span style={{ width: `${Math.round(backlogProgress * 100)}%` }} />
            </div>
            <div className="ps5-panel__foot">
              <strong>{completedCount}</strong>
              <span>completed</span>
              <span className="ps5-panel__spark">
                <Sparkles size={11} />
                {favoriteCount}
              </span>
            </div>
          </section>
        </aside>
      </main>

      <footer className="ps5-home__footer">
        <div className="ps5-home__keys" aria-hidden="true">
          <kbd>←</kbd>
          <kbd>→</kbd>
          <span>Browse</span>
          <kbd>Enter</kbd>
          <span>Play</span>
        </div>
        <button className="ps5-home__add" type="button" onClick={() => openAddGame()}>
          <Plus size={14} />
          Add game
        </button>
      </footer>
    </div>
  )
}

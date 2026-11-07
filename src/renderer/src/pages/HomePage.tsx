import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Heart,
  LibraryBig,
  LoaderCircle,
  Play,
  Plus,
  Radio,
  Sparkles,
  Square,
  Star,
  Trash2
} from 'lucide-react'
import type { Game } from '@shared/types'
import { formatPlaytime, formatRelativeDate } from '@shared/format'
import { useOrcaStore } from '../store'
import { EmptyLibrary } from '../components/EmptyLibrary'
import { CoverArtwork, HeroArtwork } from '../components/GameArtwork'
import { WeekChart } from '../components/WeekChart'
import { computeWeek, totalPlaytime } from '../lib/visual'

export function HomePage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const active = useOrcaStore((state) => state.activeSession)
  const navigate = useOrcaStore((state) => state.navigate)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const openSteamImport = useOrcaStore((state) => state.openSteamImport)
  const launchGame = useOrcaStore((state) => state.launchGame)
  const stopSession = useOrcaStore((state) => state.stopActiveSession)
  const stopping = useOrcaStore((state) => state.stopping)
  const setFavorite = useOrcaStore((state) => state.setFavorite)
  const removeGame = useOrcaStore((state) => state.removeGame)
  const reorderGames = useOrcaStore((state) => state.reorderGames)
  const playSound = useOrcaStore((state) => state.playSound)

  const visibleGames = useMemo(() => snapshot?.games.filter((game) => !game.hidden) ?? [], [snapshot])
  const [selectedId, setSelectedId] = useState(
    () => active?.gameId ?? visibleGames[0]?.id ?? ''
  )
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const railRef = useRef<HTMLDivElement>(null)

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

  // Center the selected tile with a single smooth scroll instead of scrollIntoView,
  // which also nudges the page scroll container on every keypress.
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !selectedId) return
    const tile = rail.querySelector<HTMLElement>(`[data-game-id="${CSS.escape(selectedId)}"]`)
    if (!tile) return
    const target = tile.offsetLeft + tile.offsetWidth / 2 - rail.clientWidth / 2
    const max = rail.scrollWidth - rail.clientWidth
    rail.scrollTo({
      left: Math.max(0, Math.min(target, max)),
      behavior: 'smooth'
    })
  }, [selectedId, visibleGames])

  const applyVisibleOrder = useCallback(
    (nextVisible: Game[]) => {
      if (!snapshot) return
      const visibleIds = new Set(visibleGames.map((game) => game.id))
      const queue = nextVisible.map((game) => game.id)
      const ids = snapshot.games.map((game) =>
        visibleIds.has(game.id) ? (queue.shift() as string) : game.id
      )
      void reorderGames(ids)
    },
    [reorderGames, snapshot, visibleGames]
  )

  const moveSelected = useCallback(
    (delta: number): boolean => {
      if (visibleGames.length < 2) return false
      const index = visibleGames.findIndex((game) => game.id === focusedGame?.id)
      if (index < 0) return false
      const target = index + delta
      if (target < 0 || target >= visibleGames.length) return false
      const next = [...visibleGames]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      applyVisibleOrder(next)
      return true
    },
    [applyVisibleOrder, focusedGame?.id, visibleGames]
  )

  const dropOn = useCallback(
    (targetId: string): void => {
      const sourceId = dragId
      setDragId(null)
      setDropId(null)
      if (!sourceId || sourceId === targetId) return
      const from = visibleGames.findIndex((game) => game.id === sourceId)
      const to = visibleGames.findIndex((game) => game.id === targetId)
      if (from < 0 || to < 0) return
      const next = [...visibleGames]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      applyVisibleOrder(next)
    },
    [applyVisibleOrder, dragId, visibleGames]
  )

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

      // Alt + arrow rearranges the focused game without leaving the keyboard.
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        event.preventDefault()
        if (moveSelected(event.key === 'ArrowRight' ? 1 : -1)) playSound('nav')
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
        playSound('nav')
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedId(visibleGames[(currentIndex - 1 + visibleGames.length) % visibleGames.length].id)
        playSound('nav')
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
    moveSelected,
    playSound,
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
      <div className="ps5-home__backdrop">
        <HeroArtwork game={focusedGame} className="ps5-home__backdrop-art" eager />
        <div className="ps5-home__scrim" />
      </div>

      <header className="ps5-home__shelf">
        <div className="ps5-home__shelf-heading">
          <span className="ps5-home__shelf-label">
            <span className="ps5-home__shelf-mark" />
            Your library
          </span>
          <span className="ps5-home__shelf-hint">Drag to rearrange</span>
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
                draggable
                className={clsx(
                  'ps5-rail-card',
                  selected && 'is-selected',
                  playing && 'is-playing',
                  dragId === game.id && 'is-dragging',
                  dropId === game.id && 'is-drop-target'
                )}
                data-game-id={game.id}
                data-gamepad-default={selected ? 'true' : undefined}
                title={`${game.title} — drag to rearrange`}
                onClick={() => {
                  if (!selected) playSound('nav')
                  setSelectedId(game.id)
                }}
                onDoubleClick={() => void launchGame(game.id)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', game.id)
                  setDragId(game.id)
                }}
                onDragOver={(event) => {
                  if (!dragId || dragId === game.id) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dropId !== game.id) setDropId(game.id)
                }}
                onDragLeave={() => {
                  if (dropId === game.id) setDropId(null)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  dropOn(game.id)
                }}
                onDragEnd={() => {
                  setDragId(null)
                  setDropId(null)
                }}
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
        <section className="ps5-home__hero">
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

            <button
              className="round-button round-button--danger"
              type="button"
              aria-label={`Remove ${focusedGame.title} from home`}
              title="Remove from home"
              onClick={() => removeGame(focusedGame.id)}
            >
              <Trash2 size={16} />
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
          <kbd>Alt</kbd>
          <span>Reorder</span>
        </div>
        <button className="ps5-home__add" type="button" onClick={() => openAddGame()}>
          <Plus size={14} />
          Add game
        </button>
        <button className="ps5-home__add ps5-home__add--steam" type="button" onClick={openSteamImport}>
          <Gamepad2 size={14} />
          Import Steam
        </button>
      </footer>
    </div>
  )
}

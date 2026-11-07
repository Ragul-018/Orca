import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  FolderOpen,
  Gamepad2,
  Heart,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Play,
  Square,
  Star,
  Trash2
} from 'lucide-react'
import {
  formatDate,
  formatDuration,
  formatPlaytime,
  formatRelativeDate
} from '@shared/format'
import { GAME_STATUS_LABELS } from '@shared/types'
import { useOrcaStore } from '../store'
import { HeroArtwork } from '../components/GameArtwork'

export function GamePage({ gameId }: { gameId: string }): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const active = useOrcaStore((state) => state.activeSession)
  const navigate = useOrcaStore((state) => state.navigate)
  const goBack = useOrcaStore((state) => state.goBack)
  const launchGame = useOrcaStore((state) => state.launchGame)
  const stopSession = useOrcaStore((state) => state.stopActiveSession)
  const stopping = useOrcaStore((state) => state.stopping)
  const setFavorite = useOrcaStore((state) => state.setFavorite)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const removeGame = useOrcaStore((state) => state.removeGame)
  const revealGameFolder = useOrcaStore((state) => state.revealGameFolder)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuOpen])

  if (!snapshot) return <></>

  const game = snapshot.games.find((item) => item.id === gameId)
  if (!game) {
    return (
      <div className="page game-not-found page-enter">
        <h1>This game slipped beneath the surface.</h1>
        <button className="button button--primary" type="button" onClick={() => navigate({ name: 'library' })}>
          Back to library
        </button>
      </div>
    )
  }

  const isActive = active?.gameId === game.id
  const anotherGameRunning = Boolean(active && !isActive)
  const sessions = snapshot.sessions.filter((session) => session.gameId === game.id).slice(0, 10)
  const averageSession = game.sessionCount > 0 ? game.playtimeMs / game.sessionCount : 0
  const meta = [game.developer, game.releaseYear, game.genres[0]].filter(Boolean)
  const tags = [...game.tags, ...game.genres]

  return (
    <div className="game-page page-enter">
      <section className="game-hero">
        <HeroArtwork game={game} className="game-hero__art" eager />
        <div className="game-hero__veil" />
        <button className="back-button" type="button" onClick={goBack}>
          <ArrowLeft size={17} />
          Back
        </button>

        <div className="game-hero__content">
          <span className="eyebrow">
            <span className="eyebrow__line" />
            {isActive ? 'In play' : GAME_STATUS_LABELS[game.status]}
          </span>
          <h1>{game.title}</h1>
          <div className="game-hero__meta">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {game.steamAppId && (
              <span className="steam-chip">
                <Gamepad2 size={12} />
                Steam
              </span>
            )}
            {game.rating !== null && game.rating > 0 && (
              <span className="rating-inline" aria-label={`${game.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} size={12} fill={index < game.rating! ? 'currentColor' : 'none'} />
                ))}
              </span>
            )}
          </div>
          {game.description && <p className="game-hero__description">{game.description}</p>}

          <div className="game-hero__actions">
            {isActive ? (
              <button
                className="button button--primary button--large"
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
                className="button button--primary button--large"
                type="button"
                disabled={anotherGameRunning}
                onClick={() => void launchGame(game.id)}
              >
                <Play size={17} fill="currentColor" />
                Play
              </button>
            )}
            <button
              className={`round-button ${game.favorite ? 'is-active' : ''}`}
              type="button"
              onClick={() => void setFavorite(game.id, !game.favorite)}
              aria-label={game.favorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart size={17} fill={game.favorite ? 'currentColor' : 'none'} />
            </button>
            <div className="more-menu" ref={menuRef}>
              <button
                className="round-button"
                type="button"
                aria-label="More options"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div className="more-menu__panel">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      openAddGame(game.id)
                    }}
                  >
                    <Pencil size={14} /> Edit details
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      void revealGameFolder(game.id)
                    }}
                  >
                    <FolderOpen size={14} /> Show in folder
                  </button>
                  <span className="more-menu__separator" />
                  <button
                    className="is-danger"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      removeGame(game.id)
                    }}
                  >
                    <Trash2 size={14} /> Remove game
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="game-hero__playtime">
          <span>Time in the deep</span>
          <strong>{formatPlaytime(game.playtimeMs)}</strong>
          <small>{game.lastPlayedAt ? `Last played ${formatRelativeDate(game.lastPlayedAt)}` : 'Not played yet'}</small>
        </div>
      </section>

      <div className="game-detail-body">
        <div className="game-detail-main">
          <section className="panel game-overview">
            <span className="eyebrow">
              <span className="eyebrow__line" />
              About
            </span>
            <h2>{game.description ? 'The story' : 'No field notes yet'}</h2>
            <p>
              {game.description ||
                'Add a description from Edit details to give this game a little more presence in your library.'}
            </p>
            {game.notes && (
              <>
                <h3>Your notes</h3>
                <p className="game-overview__notes">{game.notes}</p>
              </>
            )}
            {tags.length > 0 && (
              <div className="tag-list">
                {[...new Set(tags)].slice(0, 10).map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="panel game-sessions">
            <div className="panel__heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" />
                  History
                </span>
                <h2>Recent sessions</h2>
              </div>
              <Clock3 size={18} className="panel__icon" />
            </div>
            {sessions.length > 0 ? (
              <div className="session-list">
                {sessions.map((session) => (
                  <div className="session-row" key={session.id}>
                    <span className="session-row__dot" />
                    <div>
                      <strong>{formatDate(session.startedAt)}</strong>
                      <small>
                        {new Date(session.startedAt).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                        {session.endReason === 'stopped'
                          ? ' · stopped from Orca'
                          : session.endReason === 'recovered'
                            ? ' · recovered after restart'
                            : ' · exited'}
                        {session.source === 'external' ? ' · auto-tracked' : ''}
                        {session.processName ? ` · ${session.processName}` : ''}
                      </small>
                    </div>
                    <span>{formatDuration(session.durationMs, { includeSeconds: true })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="small-empty">
                <Clock3 size={20} />
                <p>The clock starts when you press play.</p>
              </div>
            )}
          </section>
        </div>

        <aside className="game-detail-side">
          <section className="panel playtime-panel">
            <span className="eyebrow">
              <span className="eyebrow__line" />
              At a glance
            </span>
            <div className="playtime-panel__hero">
              <strong>{game.playtimeMs > 0 ? formatPlaytime(game.playtimeMs) : '0 hrs'}</strong>
              <span>total playtime</span>
            </div>
            <div className="playtime-panel__stats">
              <div>
                <span>Sessions</span>
                <strong>{game.sessionCount}</strong>
              </div>
              <div>
                <span>Average</span>
                <strong>{averageSession > 0 ? formatDuration(averageSession, { compact: true }) : '—'}</strong>
              </div>
              <div>
                <span>Last played</span>
                <strong>{game.lastPlayedAt ? formatRelativeDate(game.lastPlayedAt) : 'Never'}</strong>
              </div>
            </div>
          </section>

          <section className="panel game-facts">
            <span className="eyebrow">
              <span className="eyebrow__line" />
              Details
            </span>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{GAME_STATUS_LABELS[game.status]}</dd>
              </div>
              <div>
                <dt>Developer</dt>
                <dd>{game.developer || '—'}</dd>
              </div>
              <div>
                <dt>Released</dt>
                <dd>{game.releaseYear || '—'}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{formatDate(game.addedAt)}</dd>
              </div>
              {game.steamAppId && (
                <div>
                  <dt>Steam app</dt>
                  <dd>{game.steamAppId}</dd>
                </div>
              )}
              <div>
                <dt>Launch mode</dt>
                <dd>{game.runAsAdmin ? 'Administrator' : 'Standard'}</dd>
              </div>
            </dl>
            <button className="game-facts__folder" type="button" onClick={() => void revealGameFolder(game.id)}>
              <FolderOpen size={14} />
              <span>Open game folder</span>
            </button>
          </section>

          <section className="panel game-path">
            <div className="game-path__heading">
              <CalendarDays size={15} />
              <span>Launch target</span>
            </div>
            <code title={game.executablePath}>{game.executablePath}</code>
          </section>
        </aside>
      </div>
    </div>
  )
}

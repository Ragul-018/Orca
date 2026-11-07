import { useRef } from 'react'
import { Heart, Play, Square } from 'lucide-react'
import type { Game } from '@shared/types'
import { formatPlaytime } from '@shared/format'
import { useOrcaStore } from '../store'
import { CoverArtwork } from './GameArtwork'

interface GameCardProps {
  game: Game
  showPlaytime?: boolean
  anotherGameRunning?: boolean
}

export function GameCard({ game, showPlaytime = true, anotherGameRunning = false }: GameCardProps): React.JSX.Element {
  const openGame = useOrcaStore((state) => state.openGame)
  const launchGame = useOrcaStore((state) => state.launchGame)
  const active = useOrcaStore((state) => state.activeSession)
  const cardRef = useRef<HTMLElement>(null)
  const isActive = active?.gameId === game.id

  const handleMove = (event: React.MouseEvent<HTMLElement>): void => {
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    card.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`)
    card.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`)
  }

  return (
    <article
      ref={cardRef}
      className={`game-card ${isActive ? 'is-playing' : ''}`}
      role="button"
      tabIndex={0}
      data-game-id={game.id}
      onClick={() => openGame(game.id)}
      onMouseMove={handleMove}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openGame(game.id)
        }
      }}
      aria-label={`Open ${game.title}`}
    >
      <div className="game-card__art">
        <CoverArtwork game={game} />
        <span className="game-card__pointer-glow" />
        <span className="game-card__shade" />
        {game.favorite && (
          <span className="game-card__favorite" aria-label="Favorite">
            <Heart size={13} fill="currentColor" />
          </span>
        )}
        {isActive ? (
          <span className="game-card__playing">
            <span className="pulse-dot" />
            Playing now
          </span>
        ) : (
          <button
            className="game-card__play"
            type="button"
            disabled={anotherGameRunning}
            title={anotherGameRunning ? 'Stop the running game first' : `Play ${game.title}`}
            aria-label={`Play ${game.title}`}
            onClick={(event) => {
              event.stopPropagation()
              void launchGame(game.id)
            }}
          >
            <Play size={15} fill="currentColor" />
          </button>
        )}
      </div>
      <div className="game-card__meta">
        <div className="game-card__title-row">
          <h3>{game.title}</h3>
          {isActive && <Square size={9} fill="currentColor" className="game-card__active-square" />}
        </div>
        <div className="game-card__subline">
          <span>{game.developer || game.genres[0] || 'In your library'}</span>
          {showPlaytime && game.playtimeMs > 0 && <span>{formatPlaytime(game.playtimeMs)}</span>}
        </div>
      </div>
    </article>
  )
}

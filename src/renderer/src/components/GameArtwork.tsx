import { useEffect, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import type { Game } from '@shared/types'
import { artUrl } from '../lib/artUrl'
import { gameHue, initials } from '../lib/visual'
import { OrcaMark } from './Logo'

interface ArtworkImageProps {
  src?: string
  alt: string
  className?: string
  eager?: boolean
}

export function ArtworkImage({ src, alt, className, eager = false }: ArtworkImageProps): React.JSX.Element | null {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) return null

  return (
    <img
      className={clsx('artwork-image', className)}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

interface ArtProps {
  game: Pick<Game, 'title' | 'coverArt' | 'heroArt'>
  className?: string
  eager?: boolean
}

export function CoverArtwork({ game, className, eager }: ArtProps): React.JSX.Element {
  const src = artUrl(game.coverArt)
  const [failed, setFailed] = useState(false)
  const hue = useMemo(() => gameHue(game.title), [game.title])

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className={clsx('cover-artwork', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={`${game.title} cover`}
          loading={eager ? 'eager' : 'lazy'}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="procedural-art procedural-art--cover"
          style={
            {
              '--art-hue': hue,
              '--art-hue-alt': hue + 24
            } as React.CSSProperties
          }
        >
          <span className="procedural-art__orbit procedural-art__orbit--one" />
          <span className="procedural-art__orbit procedural-art__orbit--two" />
          <span className="procedural-art__mark">
            <OrcaMark size={74} />
          </span>
          <span className="procedural-art__initials">{initials(game.title)}</span>
          <span className="procedural-art__label">ORCA LIBRARY</span>
        </div>
      )}
    </div>
  )
}

export function HeroArtwork({ game, className, eager }: ArtProps): React.JSX.Element {
  const heroSrc = artUrl(game.heroArt)
  const coverSrc = artUrl(game.coverArt)
  const src = heroSrc ?? coverSrc
  const [failed, setFailed] = useState(false)
  const hue = useMemo(() => gameHue(game.title), [game.title])

  useEffect(() => {
    setFailed(false)
  }, [src])

  return (
    <div className={clsx('hero-artwork', className)}>
      {src && !failed ? (
        <img
          className={clsx('hero-artwork__image', !game.heroArt && 'hero-artwork__image--cover')}
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="procedural-art procedural-art--hero"
          style={
            {
              '--art-hue': hue,
              '--art-hue-alt': hue + 22
            } as React.CSSProperties
          }
        >
          <span className="procedural-art__orbit procedural-art__orbit--one" />
          <span className="procedural-art__orbit procedural-art__orbit--two" />
          <span className="procedural-art__orbit procedural-art__orbit--three" />
          <span className="procedural-art__mark procedural-art__mark--hero">
            <OrcaMark size={220} />
          </span>
          <span className="procedural-art__word">{game.title}</span>
        </div>
      )}
      <span className="hero-artwork__vignette" />
    </div>
  )
}

export function MiniGameArt({ game }: { game: Pick<Game, 'title' | 'coverArt' | 'heroArt'> }): React.JSX.Element {
  return (
    <span className="mini-game-art">
      <CoverArtwork game={game} />
    </span>
  )
}

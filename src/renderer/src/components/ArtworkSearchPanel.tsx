import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles
} from 'lucide-react'
import type { ArtworkCandidate } from '@shared/types'
import { useOrcaStore } from '../store'

interface Props {
  initialQuery: string
  onApplyAll: (candidate: ArtworkCandidate) => Promise<void>
  onApplyCover: (key: string) => void
  onApplyHero: (key: string) => void
  igdbConfigured?: boolean
}

type SearchStatus = 'idle' | 'loading' | 'error' | 'done'
type AppliedState = { all?: boolean; cover?: boolean; hero?: boolean }

const SOURCE_LABELS: Record<ArtworkCandidate['source'], string> = {
  steam: 'Steam',
  igdb: 'IGDB',
  rawg: 'RAWG'
}

export function ArtworkSearchPanel({
  initialQuery,
  onApplyAll,
  onApplyCover,
  onApplyHero,
  igdbConfigured
}: Props): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery)
  const [candidates, setCandidates] = useState<ArtworkCandidate[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [applied, setApplied] = useState<Record<string, AppliedState>>({})
  const [failedImages, setFailedImages] = useState<Record<string, number>>({})
  const addToast = useOrcaStore((state) => state.addToast)
  const autoSearched = useRef(false)
  const requestSequence = useRef(0)

  async function runSearch(target?: string): Promise<void> {
    const nextQuery = (target ?? query).trim()
    if (!nextQuery) return
    const requestId = requestSequence.current + 1
    requestSequence.current = requestId
    setStatus('loading')
    setError('')
    setCandidates([])
    setApplied({})
    setFailedImages({})
    try {
      const result = await window.orca.fetchArtwork(nextQuery)
      if (requestSequence.current !== requestId) return
      if (result.error && result.candidates.length === 0) {
        setStatus('error')
        setError(result.error)
        return
      }
      setCandidates(result.candidates)
      setStatus('done')
      if (result.error) setError(result.error)
    } catch (caught) {
      if (requestSequence.current !== requestId) return
      setStatus('error')
      setError(caught instanceof Error ? caught.message : 'The artwork search failed.')
    }
  }

  useEffect(() => {
    if (autoSearched.current) return
    const trimmed = initialQuery.trim()
    if (!trimmed) return
    autoSearched.current = true
    void runSearch(trimmed)
    // Auto-search once with the title the modal was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery])

  function markApplied(id: string, patch: AppliedState): void {
    setApplied((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  async function applyEverything(candidate: ArtworkCandidate): Promise<void> {
    if (busy) return
    setBusy(`${candidate.id}:all`)
    try {
      await onApplyAll(candidate)
      markApplied(candidate.id, {
        all: true,
        cover: Boolean(candidate.coverUrl),
        hero: Boolean(candidate.heroUrl)
      })
      addToast(`Applied ${candidate.title} artwork and details.`, 'success')
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'The game details could not be applied.')
    } finally {
      setBusy(null)
    }
  }

  async function applyCoverOnly(candidate: ArtworkCandidate): Promise<void> {
    if (!candidate.coverUrl || busy) return
    setBusy(`${candidate.id}:cover`)
    try {
      const key = await window.orca.importArtworkUrl(candidate.coverUrl, 'cover')
      if (key) {
        onApplyCover(key)
        markApplied(candidate.id, { cover: true })
        addToast('Cover artwork applied.', 'success')
      } else {
        addToast('That cover could not be downloaded.')
      }
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'The cover could not be downloaded.')
    } finally {
      setBusy(null)
    }
  }

  async function applyHeroOnly(candidate: ArtworkCandidate): Promise<void> {
    if (!candidate.heroUrl || busy) return
    setBusy(`${candidate.id}:hero`)
    try {
      const key = await window.orca.importArtworkUrl(candidate.heroUrl, 'hero')
      if (key) {
        onApplyHero(key)
        markApplied(candidate.id, { hero: true })
        addToast('Hero artwork applied.', 'success')
      } else {
        addToast('That hero artwork could not be downloaded.')
      }
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'The hero artwork could not be downloaded.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="artwork-panel">
      <div className="artwork-panel__search">
        <div className="field">
          <span>Find artwork and details</span>
          <div className="artwork-panel__search-row">
            <div className="artwork-panel__input">
              <Search size={15} />
              <input
                id="artwork-search-query"
                className="text-input"
                value={query}
                aria-label="Find artwork and details"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void runSearch()
                  }
                }}
                placeholder="Search by game title…"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              className="button button--primary"
              type="button"
              disabled={status === 'loading' || !query.trim()}
              onClick={() => void runSearch()}
            >
              {status === 'loading' ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Search size={15} />
              )}
              {status === 'loading' ? 'Searching' : 'Search'}
            </button>
          </div>
        </div>

        <div className="artwork-panel__tip">
          <span className="artwork-panel__tip-icon">
            <Sparkles size={14} />
          </span>
          <div>
            <strong>{igdbConfigured ? 'IGDB and Steam are connected.' : 'Steam search works with no setup.'}</strong>
            <span>
              Applying a match fills the title, developer, year, genres and description, then
              downloads its cover and hero artwork.
            </span>
          </div>
        </div>
      </div>

      {error && status !== 'loading' && (
        <div className="artwork-panel__message is-error" role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
          <button className="text-button text-button--small" type="button" onClick={() => void runSearch()}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div className="artwork-panel__loading" role="status">
          <LoaderCircle size={20} className="spin" />
          <div>
            <strong>Searching the store</strong>
            <span>Matching artwork, release details and synopsis…</span>
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="artwork-panel__empty">
          <span className="artwork-panel__empty-icon">
            <ImageIcon size={22} />
          </span>
          <strong>Start with a title</strong>
          <p>Search for the game and pick the closest match. Orca does the rest.</p>
        </div>
      )}

      {status === 'done' && candidates.length === 0 && (
        <div className="artwork-panel__empty">
          <span className="artwork-panel__empty-icon">
            <Search size={22} />
          </span>
          <strong>No matches for “{query}”</strong>
          <p>Try the base game title or a shorter spelling.</p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="artwork-panel__results">
          <div className="artwork-panel__results-head">
            <span>Matches</span>
            <span>
              {candidates.length} {candidates.length === 1 ? 'result' : 'results'}
            </span>
          </div>

          <div className="artwork-panel__list">
            {candidates.map((candidate) => {
              const state = applied[candidate.id] ?? {}
              const imageFailures = failedImages[candidate.id] ?? 0
              const coverSrc =
                imageFailures === 0
                  ? candidate.coverUrl
                  : imageFailures === 1 && candidate.source === 'steam' && candidate.steamAppId
                    ? `https://cdn.akamai.steamstatic.com/steam/apps/${candidate.steamAppId}/header.jpg`
                    : null
              return (
                <article
                  className={`artwork-result ${state.all ? 'is-applied' : ''}`}
                  key={candidate.id}
                >
                  <div className="artwork-result__art">
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        onError={() =>
                          setFailedImages((current) => ({
                            ...current,
                            [candidate.id]: (current[candidate.id] ?? 0) + 1
                          }))
                        }
                      />
                    ) : (
                      <span className="artwork-result__art-fallback">
                        <ImageIcon size={18} />
                        No art
                      </span>
                    )}
                    {candidate.heroUrl && (
                      <span className="artwork-result__hero-badge">Hero</span>
                    )}
                  </div>

                  <div className="artwork-result__body">
                    <div className="artwork-result__heading">
                      <div>
                        <h4>{candidate.title}</h4>
                        <div className="artwork-result__meta">
                          {[candidate.developer, candidate.releaseYear].filter(Boolean).join(' · ') ||
                            'Details unavailable'}
                        </div>
                      </div>
                      <span className={`artwork-result__source is-${candidate.source}`}>
                        {SOURCE_LABELS[candidate.source]}
                      </span>
                    </div>

                    {candidate.genres && candidate.genres.length > 0 && (
                      <div className="artwork-result__genres">
                        {candidate.genres.slice(0, 4).map((genre) => (
                          <span key={genre}>{genre}</span>
                        ))}
                      </div>
                    )}

                    {candidate.summary && (
                      <p className="artwork-result__summary">{candidate.summary}</p>
                    )}

                    <div className="artwork-result__actions">
                      <button
                        className={`button button--small ${
                          state.all ? 'button--applied' : 'button--primary'
                        }`}
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void applyEverything(candidate)}
                      >
                        {busy === `${candidate.id}:all` ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : state.all ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        {busy === `${candidate.id}:all`
                          ? 'Applying…'
                          : state.all
                            ? 'Applied to form'
                            : 'Apply to game'}
                      </button>

                      <button
                        className="button button--ghost button--small"
                        type="button"
                        disabled={!candidate.coverUrl || Boolean(busy)}
                        onClick={() => void applyCoverOnly(candidate)}
                      >
                        {busy === `${candidate.id}:cover` ? (
                          <LoaderCircle size={12} className="spin" />
                        ) : state.cover ? (
                          <Check size={12} />
                        ) : (
                          <Download size={12} />
                        )}
                        Cover
                      </button>

                      <button
                        className="button button--ghost button--small"
                        type="button"
                        disabled={!candidate.heroUrl || Boolean(busy)}
                        onClick={() => void applyHeroOnly(candidate)}
                      >
                        {busy === `${candidate.id}:hero` ? (
                          <LoaderCircle size={12} className="spin" />
                        ) : state.hero ? (
                          <Check size={12} />
                        ) : (
                          <Download size={12} />
                        )}
                        Hero
                      </button>

                      {state.all && (
                        <span className="artwork-result__applied-note">
                          <Check size={11} /> Details filled
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

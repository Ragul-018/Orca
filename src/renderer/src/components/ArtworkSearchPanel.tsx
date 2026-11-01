import { useState, useEffect } from 'react'
import {
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  Sparkles,
  RefreshCw,
  Image as ImageIcon
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

export function ArtworkSearchPanel({
  initialQuery,
  onApplyAll,
  onApplyCover,
  onApplyHero,
  igdbConfigured
}: Props): React.JSX.Element {
  const [query, setQuery] = useState(initialQuery)
  const [candidates, setCandidates] = useState<ArtworkCandidate[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [error, setError] = useState('')
  const [applyingAll, setApplyingAll] = useState<string | null>(null)
  const [appliedCards, setAppliedCards] = useState<Record<string, boolean>>({})
  const addToast = useOrcaStore((s) => s.addToast)

  async function doSearch(searchTarget?: string): Promise<void> {
    const q = (searchTarget ?? query).trim()
    if (!q) return
    setStatus('loading')
    setError('')
    setCandidates([])
    try {
      const result = await window.orca.fetchArtwork(q)
      if (result.error && result.candidates.length === 0) {
        setStatus('error')
        setError(result.error)
      } else {
        setCandidates(result.candidates)
        setStatus('done')
        if (result.error) {
          setError(result.error)
        }
      }
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Search failed')
    }
  }

  // Auto-search once if opened with a non-empty initial query
  useEffect(() => {
    if (initialQuery.trim() && status === 'idle' && candidates.length === 0) {
      void doSearch(initialQuery.trim())
    }
  }, [initialQuery])

  async function handleApplyAll(candidate: ArtworkCandidate): Promise<void> {
    setApplyingAll(candidate.id)
    try {
      await onApplyAll(candidate)
      setAppliedCards((prev) => ({ ...prev, [candidate.id]: true }))
      addToast(`Applied "${candidate.title}" artwork & details to form!`, 'success')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to apply details')
    } finally {
      setApplyingAll(null)
    }
  }

  async function handleApplyCoverOnly(candidate: ArtworkCandidate): Promise<void> {
    if (!candidate.coverUrl) return
    try {
      const key = await window.orca.importArtworkUrl(candidate.coverUrl, 'cover')
      if (key) {
        onApplyCover(key)
        addToast('Cover artwork applied.', 'success')
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Cover download failed')
    }
  }

  async function handleApplyHeroOnly(candidate: ArtworkCandidate): Promise<void> {
    if (!candidate.heroUrl) return
    try {
      const key = await window.orca.importArtworkUrl(candidate.heroUrl, 'hero')
      if (key) {
        onApplyHero(key)
        addToast('Hero background artwork applied.', 'success')
      }
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Hero download failed')
    }
  }

  return (
    <div className="form-section artwork-tab-section">
      <div className="field">
        <span>Search online database</span>
        <div className="field-row" style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
          <input
            className="text-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void doSearch()
            }}
            placeholder="Search by game title (e.g. Metro 2033 Redux, Hades)..."
            aria-label="Search game title"
          />
          <button
            className="button button--primary"
            type="button"
            style={{ flexShrink: 0, minWidth: '130px', height: '44px' }}
            disabled={status === 'loading' || !query.trim()}
            onClick={() => void doSearch()}
          >
            {status === 'loading' ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Search size={16} />
            )}
            {status === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      <div
        className="form-callout"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          margin: '4px 0 16px'
        }}
      >
        <Sparkles size={16} style={{ color: '#2dd4bf', flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.75)' }}>
          {igdbConfigured ? (
            <span>
              <strong>IGDB & Steam active.</strong> Selecting a game automatically imports 4K hero art, covers, developer, release year, genres, and synopsis.
            </span>
          ) : (
            <span>
              <strong>Steam search active (Zero setup).</strong> Selecting a game automatically downloads artwork and fills in all details. (For Twitch 1080p art, connect IGDB in Settings).
            </span>
          )}
        </div>
      </div>

      {status === 'error' && (
        <div className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button
            className="text-button text-button--small"
            type="button"
            onClick={() => void doSearch()}
            style={{ marginLeft: 'auto' }}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '40px 0', color: 'rgba(255, 255, 255, 0.6)' }}>
          <LoaderCircle size={22} className="spin" style={{ color: '#2dd4bf' }} />
          <span>Searching game database & artwork...</span>
        </div>
      )}

      {status === 'done' && candidates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255, 255, 255, 0.5)' }}>
          <ImageIcon size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
          <p>No games found for &ldquo;{query}&rdquo;. Check spelling or try a shorter title.</p>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="field">
          <span>Search results ({candidates.length}) — Click &ldquo;Apply to Game&rdquo; to auto-fill details</span>
          <div className="artwork-results-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
            {candidates.map((c) => {
              const isApplied = appliedCards[c.id]
              const isApplying = applyingAll === c.id

              return (
                <div
                  key={c.id}
                  className={`artwork-candidate-card ${isApplied ? 'is-selected-card' : ''}`}
                >
                  <div className="artwork-candidate-card__art">
                    {c.coverUrl ? (
                      <img src={c.coverUrl} alt={c.title} loading="lazy" />
                    ) : (
                      <div className="artwork-candidate-card__placeholder">No Art</div>
                    )}
                  </div>

                  <div className="artwork-candidate-card__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong className="artwork-candidate-card__title">{c.title}</strong>
                      <span
                        className="badge"
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: c.source === 'igdb' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(2, 132, 199, 0.2)',
                          color: c.source === 'igdb' ? '#c084fc' : '#38bdf8',
                          border: `1px solid ${c.source === 'igdb' ? 'rgba(168, 85, 247, 0.4)' : 'rgba(2, 132, 199, 0.4)'}`
                        }}
                      >
                        {c.source}
                      </span>
                    </div>

                    <div className="artwork-candidate-card__meta">
                      {c.developer && <span>{c.developer}</span>}
                      {c.releaseYear && <span>• {c.releaseYear}</span>}
                      {c.genres && c.genres.length > 0 && <span>• {c.genres.slice(0, 3).join(', ')}</span>}
                    </div>

                    {c.summary && (
                      <p className="artwork-candidate-card__synopsis">
                        {c.summary}
                      </p>
                    )}
                  </div>

                  <div className="artwork-candidate-card__actions">
                    <button
                      className={`button ${isApplied ? 'button--ghost' : 'button--primary'}`}
                      type="button"
                      disabled={isApplying}
                      onClick={() => void handleApplyAll(c)}
                      title="Import cover & hero art, and auto-fill developer, year, genres and description in Details tab"
                    >
                      {isApplying ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : isApplied ? (
                        <CheckCircle2 size={14} style={{ color: '#4ade80' }} />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {isApplying ? 'Applying…' : isApplied ? 'Applied to details' : 'Apply to game'}
                    </button>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {c.coverUrl && (
                        <button
                          className="button button--glass button--sm"
                          type="button"
                          onClick={() => void handleApplyCoverOnly(c)}
                          title="Apply cover image only"
                        >
                          <Download size={12} /> Cover only
                        </button>
                      )}
                      {c.heroUrl && (
                        <button
                          className="button button--glass button--sm"
                          type="button"
                          onClick={() => void handleApplyHeroOnly(c)}
                          title="Apply hero wallpaper only"
                        >
                          <Download size={12} /> Hero only
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

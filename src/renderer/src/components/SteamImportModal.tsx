import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckSquare,
  Download,
  FolderSearch,
  Gamepad2,
  LoaderCircle,
  RefreshCw,
  Search,
  Square,
  X
} from 'lucide-react'
import type {
  SteamGame,
  SteamImportProgress,
  SteamImportResult,
  SteamLibraryScan
} from '@shared/types'
import { formatBytes } from '../lib/visual'
import { formatRelativeDate } from '@shared/format'
import { cleanErrorMessage } from '../lib/errors'
import { useOrcaStore } from '../store'

function isSelectable(game: SteamGame): boolean {
  return Boolean(game.executablePath) && !game.alreadyInLibrary
}

function ProgressBar({ value }: { value: number }): React.JSX.Element {
  return (
    <span className="steam-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </span>
  )
}

function SteamCover({ game }: { game: SteamGame }): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  return (
    <span className="steam-row__cover">
      {!failed ? (
        <img src={game.coverUrl} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <span className="steam-row__cover-fallback">
          <Gamepad2 size={20} />
        </span>
      )}
    </span>
  )
}

export function SteamImportModal(): React.JSX.Element | null {
  const open = useOrcaStore((state) => state.steamModalOpen)
  const close = useOrcaStore((state) => state.closeSteamImport)
  const openAddGame = useOrcaStore((state) => state.openAddGame)
  const importGames = useOrcaStore((state) => state.importSteamGames)
  const navigate = useOrcaStore((state) => state.navigate)
  const playSound = useOrcaStore((state) => state.playSound)

  const [scan, setScan] = useState<SteamLibraryScan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<Map<number, SteamImportProgress>>(new Map())
  const [result, setResult] = useState<SteamImportResult | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    setScan(null)
    setSelected(new Set())
    setProgress(new Map())
    setResult(null)
    setQuery('')

    void window.orca
      .scanSteamLibrary()
      .then((library) => {
        if (!cancelled) setScan(library)
      })
      .catch((caught) => {
        if (!cancelled) setError(cleanErrorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, refreshKey])

  useEffect(() => {
    if (!open) return
    return window.orca.onSteamImportProgress((entry) => {
      setProgress((current) => new Map(current).set(entry.appId, entry))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !importing) close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, importing, open])

  const games = scan?.games ?? []
  const selectableGames = useMemo(() => games.filter(isSelectable), [games])
  const filteredGames = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return games
    return games.filter((game) =>
      `${game.title} ${game.installDir} ${game.libraryPath}`.toLowerCase().includes(normalized)
    )
  }, [games, query])
  const filteredSelectable = filteredGames.filter(isSelectable)
  const allVisibleSelected =
    filteredSelectable.length > 0 && filteredSelectable.every((game) => selected.has(game.appId))
  const selectedGames = games.filter((game) => selected.has(game.appId))
  const progressEntries = [...progress.values()]
  const completed = progressEntries.filter((entry) =>
    ['done', 'skipped', 'error'].includes(entry.stage)
  ).length
  const percent = selectedGames.length > 0 ? Math.round((completed / selectedGames.length) * 100) : 0
  const current = progressEntries.find((entry) => !['done', 'skipped', 'error'].includes(entry.stage))

  if (!open) return null

  const toggle = (game: SteamGame): void => {
    if (!isSelectable(game) || importing) return
    playSound('toggle')
    setSelected((currentSet) => {
      const next = new Set(currentSet)
      if (next.has(game.appId)) next.delete(game.appId)
      else next.add(game.appId)
      return next
    })
  }

  const selectAllVisible = (): void => {
    if (importing) return
    playSound('toggle')
    setSelected((currentSet) => {
      const next = new Set(currentSet)
      if (allVisibleSelected) {
        for (const game of filteredSelectable) next.delete(game.appId)
      } else {
        for (const game of filteredSelectable) next.add(game.appId)
      }
      return next
    })
  }

  const runImport = async (): Promise<void> => {
    if (selectedGames.length === 0 || importing) return
    setImporting(true)
    setProgress(new Map())
    setResult(null)
    const appIds = selectedGames.map((game) => game.appId)
    const outcome = await importGames(appIds)
    setImporting(false)
    if (!outcome) return

    setResult(outcome)
    setSelected(new Set())
    setScan((currentScan) => {
      if (!currentScan) return currentScan
      const addedIds = new Set(appIds.filter((appId) => !outcome.failed.some((failure) => failure.appId === appId)))
      return {
        ...currentScan,
        games: currentScan.games.map((game) =>
          addedIds.has(game.appId) ? { ...game, alreadyInLibrary: true } : game
        )
      }
    })
  }

  const viewLibrary = (): void => {
    close()
    navigate({ name: 'library' })
  }

  return (
    <div
      className="modal-backdrop steam-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) close()
      }}
    >
      <section className="steam-modal" role="dialog" aria-modal="true" aria-labelledby="steam-import-title">
        <header className="steam-modal__header">
          <div className="steam-modal__title">
            <span className="steam-modal__mark">
              <Gamepad2 size={20} />
            </span>
            <div>
              <span className="eyebrow">
                <span className="eyebrow__line" />
                Your Steam shelf
              </span>
              <h2 id="steam-import-title">Import from Steam</h2>
              <p>
                {scan
                  ? `${games.length} installed ${games.length === 1 ? 'game' : 'games'} across ${scan.libraries.length} ${scan.libraries.length === 1 ? 'library' : 'libraries'}.`
                  : 'Reading your local Steam library. No account or API key needed.'}
              </p>
            </div>
          </div>
          <button className="modal-close" type="button" onClick={close} aria-label="Close" disabled={importing}>
            <X size={18} />
          </button>
        </header>

        {loading ? (
          <div className="steam-state">
            <span className="steam-state__icon">
              <LoaderCircle size={26} className="spin" />
            </span>
            <h3>Looking for Steam</h3>
            <p>Reading library folders and app manifests from this PC.</p>
          </div>
        ) : error ? (
          <div className="steam-state steam-state--error">
            <span className="steam-state__icon">
              <AlertTriangle size={26} />
            </span>
            <h3>Steam library not found</h3>
            <p>{error}</p>
            <div className="steam-state__actions">
              <button className="button button--glass" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
                <RefreshCw size={15} />
                Try again
              </button>
              <button className="button button--primary" type="button" onClick={() => openAddGame()}>
                <FolderSearch size={15} />
                Add a game manually
              </button>
            </div>
          </div>
        ) : games.length === 0 ? (
          <div className="steam-state">
            <span className="steam-state__icon">
              <Gamepad2 size={26} />
            </span>
            <h3>No installed Steam games</h3>
            <p>
              Orca found Steam, but none of its app manifests point to an installed game folder. Install a game
              in Steam, then refresh.
            </p>
            <div className="steam-state__actions">
              <button className="button button--glass" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
                <RefreshCw size={15} />
                Refresh
              </button>
              <button className="button button--primary" type="button" onClick={() => openAddGame()}>
                <FolderSearch size={15} />
                Add manually
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="steam-toolbar">
              <label className="search-field steam-search">
                <Search size={15} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a Steam game"
                  aria-label="Search Steam games"
                  disabled={importing}
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear Steam search">
                    <X size={13} />
                  </button>
                )}
              </label>
              <div className="steam-toolbar__selection">
                <button className="button button--ghost button--small" type="button" onClick={selectAllVisible} disabled={importing}>
                  {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  {allVisibleSelected ? 'Clear visible' : 'Select all'}
                </button>
                <span>
                  {selected.size} selected · {selectableGames.length} available
                </span>
              </div>
            </div>

            {result && (
              <div className={`steam-result ${result.failed.length > 0 ? 'is-warning' : ''}`}>
                <span className="steam-result__icon">
                  {result.failed.length > 0 ? <AlertTriangle size={17} /> : <Check size={17} />}
                </span>
                <div>
                  <strong>
                    {result.added > 0
                      ? `${result.added} ${result.added === 1 ? 'game' : 'games'} imported`
                      : 'Nothing new imported'}
                  </strong>
                  <p>
                    {result.skipped > 0 ? `${result.skipped} skipped. ` : ''}
                    {result.failed.length > 0
                      ? `${result.failed.length} could not be added. ${result.failed
                          .slice(0, 2)
                          .map((failure) => `${failure.title}: ${failure.error}`)
                          .join(' ')}`
                      : 'Steam artwork was pulled automatically.'}
                  </p>
                </div>
                <div className="steam-result__actions">
                  {result.added > 0 && (
                    <button className="button button--primary button--small" type="button" onClick={viewLibrary}>
                      View library
                    </button>
                  )}
                  <button className="button button--ghost button--small" type="button" onClick={() => setResult(null)}>
                    Import more
                  </button>
                </div>
              </div>
            )}

            <div className="steam-list" role="list" aria-label="Installed Steam games">
              {filteredGames.map((game) => {
                const selectable = isSelectable(game)
                const isSelected = selected.has(game.appId)
                const entry = progress.get(game.appId)
                const busy = importing && entry !== undefined && !['done', 'skipped', 'error'].includes(entry.stage)
                return (
                  <div
                    className={`steam-row ${isSelected ? 'is-selected' : ''} ${!selectable ? 'is-disabled' : ''}`}
                    key={game.appId}
                    role="listitem"
                  >
                    <button
                      className={`steam-row__check ${isSelected ? 'is-checked' : ''}`}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={`${isSelected ? 'Deselect' : 'Select'} ${game.title}`}
                      disabled={!selectable || importing}
                      onClick={() => toggle(game)}
                    >
                      {isSelected ? <Check size={13} /> : null}
                    </button>

                    <SteamCover game={game} />

                    <button
                      className="steam-row__body"
                      type="button"
                      disabled={!selectable || importing}
                      onClick={() => toggle(game)}
                      title={game.installDir}
                    >
                      <span className="steam-row__name">
                        <strong>{game.title}</strong>
                        {game.alreadyInLibrary && <span className="steam-badge">In library</span>}
                        {!game.executablePath && <span className="steam-badge steam-badge--warning">No executable</span>}
                        {game.executablePath && !game.alreadyInLibrary && (
                          <span className="steam-badge steam-badge--muted">{game.confidence}% match</span>
                        )}
                      </span>
                      <span className="steam-row__path">{game.installDir}</span>
                    </button>

                    <span className="steam-row__meta">
                      <span>{formatBytes(game.sizeOnDisk)}</span>
                      <small>{game.lastPlayedAt ? `Played ${formatRelativeDate(game.lastPlayedAt)}` : 'Never played'}</small>
                    </span>

                    <span className="steam-row__progress">
                      {busy && <LoaderCircle size={15} className="spin" />}
                      {entry?.stage === 'done' && <Check size={15} />}
                      {entry?.stage === 'error' && <AlertTriangle size={15} />}
                      {entry?.stage === 'skipped' && <span className="steam-row__skip">Skipped</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            {filteredGames.length === 0 && (
              <div className="steam-list-empty">
                <Search size={20} />
                <p>No installed Steam games match “{query}”.</p>
              </div>
            )}

            <footer className="steam-modal__footer">
              <div className="steam-footer__status">
                {importing ? (
                  <>
                    <span className="steam-footer__spinner">
                      <LoaderCircle size={15} className="spin" />
                    </span>
                    <div>
                      <strong>{current ? `${current.title} — ${current.stage}` : 'Preparing import…'}</strong>
                      <ProgressBar value={percent} />
                    </div>
                    <span className="steam-footer__percent">{percent}%</span>
                  </>
                ) : (
                  <span className="steam-footer__hint">
                    <Download size={14} />
                    Covers and hero art download automatically from Steam’s CDN.
                  </span>
                )}
              </div>
              <div className="steam-footer__actions">
                <button className="button button--ghost" type="button" onClick={close} disabled={importing}>
                  Cancel
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void runImport()}
                  disabled={selected.size === 0 || importing}
                >
                  {importing ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
                  {importing
                    ? 'Importing…'
                    : `Import ${selected.size > 0 ? selected.size : ''} ${selected.size === 1 ? 'game' : 'games'}`}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  )
}

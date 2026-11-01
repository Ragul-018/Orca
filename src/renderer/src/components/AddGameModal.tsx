import { useEffect, useRef, useState } from 'react'
import {
  Check,
  FolderSearch,
  Heart,
  ImagePlus,
  LoaderCircle,
  ScanSearch,
  Star,
  X
} from 'lucide-react'
import type { AddGameInput, Game, GameStatus, ScanCandidate } from '@shared/types'
import { GAME_STATUSES, GAME_STATUS_LABELS } from '@shared/types'
import { parseList } from '@shared/format'
import { useOrcaStore } from '../store'
import { cleanErrorMessage } from '../lib/errors'
import { artUrl } from '../lib/artUrl'
import { formatBytes } from '../lib/visual'
import { CoverArtwork, HeroArtwork } from './GameArtwork'
import { ArtworkSearchPanel } from './ArtworkSearchPanel'

interface FormState {
  title: string
  executablePath: string
  launchArguments: string
  workingDirectory: string
  runAsAdmin: boolean
  watchProcess: string
  coverArt: string | null
  heroArt: string | null
  description: string
  developer: string
  releaseYear: string
  genresText: string
  tagsText: string
  notes: string
  status: GameStatus
  rating: number | null
  favorite: boolean
}

function emptyForm(): FormState {
  return {
    title: '',
    executablePath: '',
    launchArguments: '',
    workingDirectory: '',
    runAsAdmin: false,
    watchProcess: '',
    coverArt: null,
    heroArt: null,
    description: '',
    developer: '',
    releaseYear: '',
    genresText: '',
    tagsText: '',
    notes: '',
    status: 'unplayed',
    rating: null,
    favorite: false
  }
}

function formFromGame(game: Game): FormState {
  return {
    title: game.title,
    executablePath: game.executablePath,
    launchArguments: game.launchArguments,
    workingDirectory: game.workingDirectory,
    runAsAdmin: game.runAsAdmin,
    watchProcess: game.watchProcess,
    coverArt: game.coverArt,
    heroArt: game.heroArt,
    description: game.description,
    developer: game.developer,
    releaseYear: game.releaseYear,
    genresText: game.genres.join(', '),
    tagsText: game.tags.join(', '),
    notes: game.notes,
    status: game.status,
    rating: game.rating,
    favorite: game.favorite
  }
}

function fakeGame(form: FormState) {
  return {
    title: form.title || 'Untitled game',
    coverArt: form.coverArt,
    heroArt: form.heroArt
  }
}

export function AddGameModal(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const modal = useOrcaStore((state) => state.addGameModal)
  const close = useOrcaStore((state) => state.closeAddGame)
  const addGame = useOrcaStore((state) => state.addGame)
  const updateGame = useOrcaStore((state) => state.updateGame)
  const addToast = useOrcaStore((state) => state.addToast)
  const game = modal.gameId ? snapshot?.games.find((item) => item.id === modal.gameId) ?? null : null
  const isEdit = Boolean(game)
  const [form, setForm] = useState<FormState>(() => (game ? formFromGame(game) : emptyForm()))
  const [tab, setTab] = useState<'details' | 'launch' | 'artwork'>('details')
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanCandidates, setScanCandidates] = useState<ScanCandidate[] | null>(null)
  const [scanFolderName, setScanFolderName] = useState('')
  const [error, setError] = useState('')
  const scanStarted = useRef(false)

  const patch = (value: Partial<FormState>): void => {
    setForm((current) => ({ ...current, ...value }))
    setError('')
  }

  const chooseExecutable = async (): Promise<void> => {
    setError('')
    try {
      const choice = await window.orca.chooseExecutable()
      if (!choice) return
      patch({
        executablePath: choice.executablePath,
        title: form.title.trim() ? form.title : choice.suggestedTitle,
        workingDirectory: choice.workingDirectory,
        launchArguments: form.launchArguments || choice.launchArguments
      })
      setTab('launch')
    } catch (caught) {
      setError(cleanErrorMessage(caught))
    }
  }

  const scanForGames = async (): Promise<void> => {
    if (scanning) return
    setTab('launch')
    setScanning(true)
    setError('')
    try {
      const result = await window.orca.scanFolder()
      if (!result) return
      setScanFolderName(result.folder)
      setScanCandidates(result.candidates)
      if (result.candidates.length === 0) {
        addToast('No game executables surfaced in that folder.')
      }
    } catch (caught) {
      setError(cleanErrorMessage(caught))
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => {
    if (!modal.startWithScan || isEdit || scanStarted.current) return
    scanStarted.current = true
    const timer = window.setTimeout(() => {
      void scanForGames()
    }, 420)
    return () => window.clearTimeout(timer)
    // The scan should only run once when this modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !saving) close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, saving])

  const applyCandidate = (candidate: ScanCandidate): void => {
    patch({
      title: candidate.suggestedTitle,
      executablePath: candidate.executablePath,
      workingDirectory: candidate.directory,
      coverArt: candidate.coverArt ?? form.coverArt,
      heroArt: candidate.heroArt ?? form.heroArt
    })
    setTab('launch')
    setScanCandidates(null)
  }

  const chooseArt = async (kind: 'cover' | 'hero'): Promise<void> => {
    try {
      const key = await window.orca.chooseArtwork(kind)
      if (key) patch(kind === 'cover' ? { coverArt: key } : { heroArt: key })
    } catch (caught) {
      setError(cleanErrorMessage(caught))
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!form.title.trim()) {
      setError('Give this game a name.')
      setTab('details')
      return
    }
    if (!form.executablePath.trim()) {
      setError('Choose the game executable.')
      setTab('launch')
      return
    }

    const payload: AddGameInput = {
      title: form.title.trim(),
      executablePath: form.executablePath.trim(),
      launchArguments: form.launchArguments.trim(),
      workingDirectory: form.workingDirectory.trim(),
      runAsAdmin: form.runAsAdmin,
      watchProcess: form.watchProcess.trim(),
      coverArt: form.coverArt,
      heroArt: form.heroArt,
      description: form.description.trim(),
      developer: form.developer.trim(),
      releaseYear: form.releaseYear.trim(),
      genres: parseList(form.genresText),
      tags: parseList(form.tagsText),
      notes: form.notes.trim(),
      status: form.status,
      rating: form.rating,
      favorite: form.favorite
    }

    setSaving(true)
    setError('')
    try {
      if (isEdit && game) {
        const updated = await updateGame({ ...payload, id: game.id })
        if (!updated) return
        addToast('Game details saved.', 'success')
      } else {
        const created = await addGame(payload)
        if (!created) return
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const displayGame = fakeGame(form)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) close()
      }}
    >
      <section className="add-game-modal" role="dialog" aria-modal="true" aria-labelledby="add-game-title">
        <header className="add-game-modal__header">
          <div>
            <span className="eyebrow">
              <span className="eyebrow__line" />
              {isEdit ? 'Refine the record' : 'New arrival'}
            </span>
            <h2 id="add-game-title">{isEdit ? 'Edit game' : 'Add a game'}</h2>
          </div>
          <button className="modal-close" type="button" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="add-game-modal__body">
          <div className="art-editor">
            <div className="art-editor__cover">
              <CoverArtwork game={displayGame} eager />
              <div className="art-editor__cover-actions">
                <button className="button button--glass button--small" type="button" onClick={() => void chooseArt('cover')}>
                  <ImagePlus size={14} />
                  {form.coverArt ? 'Change cover' : 'Add cover'}
                </button>
                {form.coverArt && (
                  <button
                    className="art-clear"
                    type="button"
                    aria-label="Remove cover"
                    onClick={() => patch({ coverArt: null })}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <button className="art-editor__hero" type="button" onClick={() => void chooseArt('hero')}>
              <HeroArtwork game={displayGame} />
              <span className="art-editor__hero-shade" />
              <span className="art-editor__hero-label">
                <ImagePlus size={14} />
                {form.heroArt ? 'Change hero artwork' : 'Add hero artwork'}
              </span>
            </button>

            <div className="art-editor__tip">
              <span>Artwork tip</span>
              <p>Use a portrait image for the cover and a wide cinematic still for the hero background.</p>
            </div>
          </div>

          <div className="game-form">
            <div className="form-tabs" role="tablist">
              <button
                className={tab === 'details' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab === 'details'}
                onClick={() => setTab('details')}
              >
                Details
              </button>
              <button
                className={tab === 'launch' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab === 'launch'}
                onClick={() => setTab('launch')}
              >
                Launch setup
              </button>
              <button
                className={tab === 'artwork' ? 'is-active' : ''}
                type="button"
                role="tab"
                aria-selected={tab === 'artwork'}
                onClick={() => setTab('artwork')}
              >
                🎨 Artwork
              </button>
            </div>

            <div className="game-form__scroll">
              {tab === 'details' ? (
                <div className="form-section">
                  <label className="field">
                    <span>Game title</span>
                    <input
                      className="text-input"
                      value={form.title}
                      onChange={(event) => patch({ title: event.target.value })}
                      placeholder="e.g. Hollow Knight"
                      autoFocus
                    />
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>Developer</span>
                      <input
                        className="text-input"
                        value={form.developer}
                        onChange={(event) => patch({ developer: event.target.value })}
                        placeholder="Studio name"
                      />
                    </label>
                    <label className="field field--year">
                      <span>Year</span>
                      <input
                        className="text-input"
                        value={form.releaseYear}
                        onChange={(event) => patch({ releaseYear: event.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="2024"
                        inputMode="numeric"
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Genres</span>
                    <input
                      className="text-input"
                      value={form.genresText}
                      onChange={(event) => patch({ genresText: event.target.value })}
                      placeholder="Action, Metroidvania, Adventure"
                    />
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>Status</span>
                      <select
                        className="select-input"
                        value={form.status}
                        onChange={(event) => patch({ status: event.target.value as GameStatus })}
                      >
                        {GAME_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {GAME_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="field">
                      <span>Your rating</span>
                      <div className="rating-picker" aria-label="Rating">
                        {Array.from({ length: 5 }).map((_, index) => {
                          const value = index + 1
                          return (
                            <button
                              key={value}
                              type="button"
                              className={form.rating !== null && value <= form.rating ? 'is-filled' : ''}
                              aria-label={`${value} stars`}
                              onClick={() => patch({ rating: form.rating === value ? null : value })}
                            >
                              <Star size={17} fill="currentColor" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  <label className="field">
                    <span>Description</span>
                    <textarea
                      className="textarea"
                      value={form.description}
                      onChange={(event) => patch({ description: event.target.value })}
                      placeholder="A few lines about the game..."
                      rows={4}
                    />
                  </label>

                  <div className="field-row">
                    <label className="field">
                      <span>Tags</span>
                      <input
                        className="text-input"
                        value={form.tagsText}
                        onChange={(event) => patch({ tagsText: event.target.value })}
                        placeholder="Cozy, Backlog, Co-op"
                      />
                    </label>
                    <div className="field">
                      <span>Favorite</span>
                      <button
                        className={`favorite-field ${form.favorite ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => patch({ favorite: !form.favorite })}
                      >
                        <Heart size={15} fill={form.favorite ? 'currentColor' : 'none'} />
                        {form.favorite ? 'In favorites' : 'Add to favorites'}
                      </button>
                    </div>
                  </div>

                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      className="textarea textarea--small"
                      value={form.notes}
                      onChange={(event) => patch({ notes: event.target.value })}
                      placeholder="Mods, save locations, controller setup..."
                      rows={3}
                    />
                  </label>
                </div>
              ) : tab === 'launch' ? (
                <div className="form-section">
                  <div className="field">
                    <div className="field__label-row">
                      <span>Game executable</span>
                      <button className="text-button text-button--small" type="button" onClick={() => void scanForGames()}>
                        {scanning ? <LoaderCircle size={13} className="spin" /> : <FolderSearch size={13} />}
                        {scanning ? 'Scanning…' : 'Scan a folder'}
                      </button>
                    </div>
                    <div className="exe-picker">
                      <input
                        className="text-input"
                        value={form.executablePath}
                        onChange={(event) => patch({ executablePath: event.target.value })}
                        placeholder="C:\Games\YourGame\Game.exe"
                        spellCheck={false}
                      />
                      <button className="button button--glass" type="button" onClick={() => void chooseExecutable()}>
                        <ScanSearch size={15} />
                        Browse
                      </button>
                    </div>
                  </div>

                  {scanCandidates && (
                    <div className="scan-results">
                      <div className="scan-results__heading">
                        <div>
                          <strong>Found {scanCandidates.length} possible games</strong>
                          <span title={scanFolderName}>{scanFolderName}</span>
                        </div>
                        <button type="button" onClick={() => setScanCandidates(null)} aria-label="Close scan results">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="scan-results__list">
                        {scanCandidates.map((candidate) => (
                          <button
                            className="scan-candidate"
                            type="button"
                            key={candidate.executablePath}
                            onClick={() => applyCandidate(candidate)}
                          >
                            <span className="scan-candidate__art">
                              {candidate.coverArt ? (
                                <img src={artUrl(candidate.coverArt)} alt="" />
                              ) : (
                                <FolderSearch size={17} />
                              )}
                            </span>
                            <span className="scan-candidate__info">
                              <strong>{candidate.suggestedTitle}</strong>
                              <small title={candidate.executablePath}>{candidate.name}</small>
                            </span>
                            <span className="scan-candidate__meta">
                              {formatBytes(candidate.size)}
                              <small>{candidate.confidence}% match</small>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="field-row">
                    <label className="field">
                      <span>Working directory</span>
                      <input
                        className="text-input"
                        value={form.workingDirectory}
                        onChange={(event) => patch({ workingDirectory: event.target.value })}
                        placeholder="Defaults to the executable folder"
                        spellCheck={false}
                      />
                    </label>
                    <label className="field">
                      <span>Process to watch</span>
                      <input
                        className="text-input"
                        value={form.watchProcess}
                        onChange={(event) => patch({ watchProcess: event.target.value })}
                        placeholder="Game.exe"
                        spellCheck={false}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Launch arguments</span>
                    <input
                      className="text-input text-input--mono"
                      value={form.launchArguments}
                      onChange={(event) => patch({ launchArguments: event.target.value })}
                      placeholder="-windowed -skiplauncher"
                      spellCheck={false}
                    />
                  </label>

                  <div className="form-callout">
                    <div>
                      <strong>Working with a launcher?</strong>
                      <p>
                        Point Orca at the real game executable when possible. If another client launches it,
                        use “Process to watch” with the game’s executable name.
                      </p>
                    </div>
                  </div>

                  <button
                    className={`switch-line ${form.runAsAdmin ? 'is-on' : ''}`}
                    type="button"
                    onClick={() => patch({ runAsAdmin: !form.runAsAdmin })}
                    role="switch"
                    aria-checked={form.runAsAdmin}
                  >
                    <span className="switch-line__copy">
                      <strong>Run as administrator</strong>
                      <small>Use only for games that require elevated permissions.</small>
                    </span>
                    <span className="toggle__thumb" />
                  </button>
                </div>
              ) : tab === 'artwork' ? (
                <ArtworkSearchPanel
                  initialQuery={form.title}
                  igdbConfigured={Boolean(snapshot?.settings.igdbClientId && snapshot?.settings.igdbClientSecret)}
                  onApplyAll={async (candidate) => {
                    let coverKey = form.coverArt
                    let heroKey = form.heroArt
                    if (candidate.coverUrl) {
                      const key = await window.orca.importArtworkUrl(candidate.coverUrl, 'cover')
                      if (key) coverKey = key
                    }
                    if (candidate.heroUrl) {
                      const key = await window.orca.importArtworkUrl(candidate.heroUrl, 'hero')
                      if (key) heroKey = key
                    }
                    patch({
                      title: candidate.title || form.title,
                      developer: candidate.developer || form.developer,
                      releaseYear: candidate.releaseYear || form.releaseYear,
                      description: candidate.summary || form.description,
                      genresText: candidate.genres && candidate.genres.length > 0 ? candidate.genres.join(', ') : form.genresText,
                      coverArt: coverKey,
                      heroArt: heroKey
                    })
                  }}
                  onApplyCover={(key) => patch({ coverArt: key })}
                  onApplyHero={(key) => patch({ heroArt: key })}
                />
              ) : null}
            </div>

            {error && <div className="form-error">{error}</div>}

            <footer className="add-game-modal__footer">
              <span className="save-hint">
                <Check size={13} />
                Saved locally, never uploaded.
              </span>
              <div>
                <button className="button button--ghost" type="button" onClick={close} disabled={saving}>
                  Cancel
                </button>
                <button className="button button--primary" type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <LoaderCircle size={15} className="spin" /> : null}
                  {isEdit ? 'Save changes' : 'Add to Orca'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </section>
    </div>
  )
}

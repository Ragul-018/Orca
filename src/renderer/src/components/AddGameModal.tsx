import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderSearch,
  Gamepad2,
  Heart,
  ImagePlus,
  Images,
  LoaderCircle,
  ScanSearch,
  Sparkles,
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

function payloadFromForm(form: FormState): AddGameInput {
  return {
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
}

function ArtEditor({
  form,
  patch,
  onFindArtwork
}: {
  form: FormState
  patch: (value: Partial<FormState>) => void
  onFindArtwork?: () => void
}): React.JSX.Element {
  const displayGame = fakeGame(form)

  const chooseArt = async (kind: 'cover' | 'hero'): Promise<void> => {
    const key = await window.orca.chooseArtwork(kind)
    if (key) patch(kind === 'cover' ? { coverArt: key } : { heroArt: key })
  }

  return (
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

      {onFindArtwork && (
        <button className="art-editor__find" type="button" onClick={onFindArtwork}>
          <Sparkles size={14} />
          Find artwork automatically
        </button>
      )}

      <div className="art-editor__tip">
        <span>Artwork tip</span>
        <p>Use a portrait image for the cover and a wide cinematic still for the hero background.</p>
      </div>
    </div>
  )
}

function OptionalDetails({
  form,
  patch
}: {
  form: FormState
  patch: (value: Partial<FormState>) => void
}): React.JSX.Element {
  return (
    <details className="form-more">
      <summary>
        <span>More details</span>
        <small>Developer, year, genres, notes — all optional</small>
      </summary>
      <div className="form-more__body">
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
              onChange={(event) =>
                patch({ releaseYear: event.target.value.replace(/\D/g, '').slice(0, 4) })
              }
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

        <label className="field">
          <span>Description</span>
          <textarea
            className="textarea"
            value={form.description}
            onChange={(event) => patch({ description: event.target.value })}
            placeholder="A few lines about the game..."
            rows={3}
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
    </details>
  )
}

function LaunchOptions({
  form,
  patch
}: {
  form: FormState
  patch: (value: Partial<FormState>) => void
}): React.JSX.Element {
  return (
    <details className="form-more">
      <summary>
        <span>Launch options</span>
        <small>Working directory, arguments, process, elevation</small>
      </summary>
      <div className="form-more__body">
        <label className="field">
          <span>Game executable</span>
          <input
            className="text-input"
            value={form.executablePath}
            onChange={(event) => patch({ executablePath: event.target.value })}
            placeholder="C:\Games\YourGame\Game.exe"
            spellCheck={false}
          />
        </label>
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
    </details>
  )
}

function CreateGameForm({
  form,
  patch,
  onBackToSource,
  onChooseExecutable,
  onScan,
  onImportSteam,
  onSave,
  saving,
  autoArtwork,
  error
}: {
  form: FormState
  patch: (value: Partial<FormState>) => void
  onBackToSource: () => void
  onChooseExecutable: () => void
  onScan: () => void
  onImportSteam: () => void
  onSave: () => void
  saving: boolean
  autoArtwork: 'idle' | 'searching' | 'done'
  error: string
}): React.JSX.Element {
  return (
    <div className="add-game-modal__body add-game-modal__body--quick">
      <ArtEditor form={form} patch={patch} />
      <div className="game-form">
        <div className="quick-source-bar">
          <button className="quick-source-bar__back" type="button" onClick={onBackToSource} aria-label="Back to add options">
            <ArrowLeft size={15} />
          </button>
          <span className="quick-source-bar__path" title={form.executablePath}>
            {form.executablePath}
          </span>
          <button className="text-button text-button--small" type="button" onClick={onChooseExecutable}>
            Change
          </button>
          <button className="text-button text-button--small" type="button" onClick={onScan}>
            <FolderSearch size={13} />
            Scan
          </button>
          <button className="text-button text-button--small" type="button" onClick={onImportSteam}>
            <Gamepad2 size={13} />
            Steam
          </button>
        </div>

        <div className="game-form__scroll game-form__scroll--quick">
          <div className="form-section">
            <label className="field">
              <span>Game title</span>
              <input
                className="text-input text-input--title"
                value={form.title}
                onChange={(event) => patch({ title: event.target.value })}
                placeholder="e.g. Hollow Knight"
                autoFocus
              />
            </label>

            <div className="quick-status-row">
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
              <button
                className={`favorite-field ${form.favorite ? 'is-active' : ''}`}
                type="button"
                onClick={() => patch({ favorite: !form.favorite })}
              >
                <Heart size={15} fill={form.favorite ? 'currentColor' : 'none'} />
                {form.favorite ? 'In favorites' : 'Add to favorites'}
              </button>
            </div>

            <OptionalDetails form={form} patch={patch} />
            <LaunchOptions form={form} patch={patch} />

            <div className="quick-art-note">
              <Sparkles size={14} />
              <span>
                {autoArtwork === 'searching'
                  ? 'Looking for official Steam artwork…'
                  : 'If no cover is set, Orca will look for official Steam artwork when you save.'}
              </span>
            </div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <footer className="add-game-modal__footer">
          <span className="save-hint">
            <Check size={13} />
            Saved locally, never uploaded.
          </span>
          <div>
            <button className="button button--ghost" type="button" onClick={onBackToSource} disabled={saving}>
              Back
            </button>
            <button className="button button--primary" type="button" onClick={onSave} disabled={saving}>
              {saving ? <LoaderCircle size={15} className="spin" /> : null}
              {autoArtwork === 'searching' ? 'Finding artwork…' : 'Add to Orca'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

function SourceChooser({
  scanning,
  scanCandidates,
  scanFolderName,
  selectedCandidates,
  onToggleCandidate,
  onSelectAll,
  onUseCandidate,
  onAddSelected,
  onCloseCandidates,
  onChooseExecutable,
  onScan,
  onImportSteam,
  onManual
}: {
  scanning: boolean
  scanCandidates: ScanCandidate[] | null
  scanFolderName: string
  selectedCandidates: Set<string>
  onToggleCandidate: (candidate: ScanCandidate) => void
  onSelectAll: () => void
  onUseCandidate: (candidate: ScanCandidate) => void
  onAddSelected: () => void
  onCloseCandidates: () => void
  onChooseExecutable: () => void
  onScan: () => void
  onImportSteam: () => void
  onManual: () => void
}): React.JSX.Element {
  if (scanning) {
    return (
      <div className="add-source-state">
        <span className="add-source-state__icon">
          <LoaderCircle size={26} className="spin" />
        </span>
        <h3>Scanning for games</h3>
        <p>Looking for executables and local artwork in the folder you chose.</p>
      </div>
    )
  }

  if (scanCandidates) {
    return (
      <div className="add-scan">
        <div className="add-scan__heading">
          <div>
            <span className="eyebrow">
              <span className="eyebrow__line" />
              Folder scan
            </span>
            <h3>
              {scanCandidates.length > 0
                ? `${scanCandidates.length} possible ${scanCandidates.length === 1 ? 'game' : 'games'} found`
                : 'No games surfaced'}
            </h3>
            <p title={scanFolderName}>{scanFolderName}</p>
          </div>
          <button className="modal-close" type="button" onClick={onCloseCandidates} aria-label="Close scan results">
            <X size={17} />
          </button>
        </div>

        {scanCandidates.length > 0 ? (
          <>
            <div className="add-scan__toolbar">
              <button className="button button--ghost button--small" type="button" onClick={onSelectAll}>
                {selectedCandidates.size === scanCandidates.length ? (
                  <Check size={14} />
                ) : (
                  <Check size={14} style={{ opacity: 0.3 }} />
                )}
                {selectedCandidates.size === scanCandidates.length ? 'Clear all' : 'Select all'}
              </button>
              <span>{selectedCandidates.size} selected</span>
            </div>
            <div className="add-scan__list">
              {scanCandidates.map((candidate) => {
                const selected = selectedCandidates.has(candidate.executablePath)
                return (
                  <div className={`add-scan__row ${selected ? 'is-selected' : ''}`} key={candidate.executablePath}>
                    <button
                      className={`add-scan__check ${selected ? 'is-checked' : ''}`}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={`${selected ? 'Deselect' : 'Select'} ${candidate.suggestedTitle}`}
                      onClick={() => onToggleCandidate(candidate)}
                    >
                      {selected ? <Check size={13} /> : null}
                    </button>
                    <span className="add-scan__art">
                      {candidate.coverArt ? (
                        <img src={artUrl(candidate.coverArt)} alt="" />
                      ) : (
                        <FolderSearch size={17} />
                      )}
                    </span>
                    <span className="add-scan__info">
                      <strong>{candidate.suggestedTitle}</strong>
                      <small title={candidate.executablePath}>{candidate.name}</small>
                    </span>
                    <span className="add-scan__meta">
                      {formatBytes(candidate.size)}
                      <small>{candidate.confidence}% match</small>
                    </span>
                    <button className="text-button text-button--small" type="button" onClick={() => onUseCandidate(candidate)}>
                      Use
                    </button>
                  </div>
                )
              })}
            </div>
            <footer className="add-scan__footer">
              <button className="button button--ghost" type="button" onClick={onScan}>
                <FolderSearch size={15} />
                Scan another folder
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={onAddSelected}
                disabled={selectedCandidates.size === 0}
              >
                <Check size={15} />
                Add {selectedCandidates.size > 0 ? selectedCandidates.size : ''}{' '}
                {selectedCandidates.size === 1 ? 'game' : 'games'}
              </button>
            </footer>
          </>
        ) : (
          <div className="add-source-state add-source-state--compact">
            <p>Try a folder that contains your game installations, or add one executable directly.</p>
            <div className="add-source-state__actions">
              <button className="button button--glass" type="button" onClick={onScan}>
                <FolderSearch size={15} />
                Scan another folder
              </button>
              <button className="button button--primary" type="button" onClick={onChooseExecutable}>
                <ScanSearch size={15} />
                Choose an executable
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="add-source">
      <div className="add-source__heading">
        <span className="eyebrow">
          <span className="eyebrow__line" />
          Start here
        </span>
        <h3>How would you like to add a game?</h3>
        <p>Pick the quickest path. Orca fills in the rest and finds artwork automatically.</p>
      </div>

      <div className="add-source__grid">
        <button className="add-source-card add-source-card--primary" type="button" onClick={onChooseExecutable}>
          <span className="add-source-card__icon">
            <ScanSearch size={24} />
          </span>
          <strong>Choose a game</strong>
          <p>Point Orca at an EXE or shortcut. The title, folder, and artwork are filled in for you.</p>
          <span className="add-source-card__cta">
            Browse files
            <ArrowRight size={15} />
          </span>
        </button>

        <button className="add-source-card" type="button" onClick={onScan}>
          <span className="add-source-card__icon">
            <FolderSearch size={24} />
          </span>
          <strong>Scan a folder</strong>
          <p>Have a games drive or a folder full of installs? Find everything in one pass and add several at once.</p>
          <span className="add-source-card__cta">
            Choose a folder
            <ArrowRight size={15} />
          </span>
        </button>

        <button className="add-source-card" type="button" onClick={onImportSteam}>
          <span className="add-source-card__icon">
            <Gamepad2 size={24} />
          </span>
          <strong>Import from Steam</strong>
          <p>Pull every installed Steam game, its executable, and official cover art. No account or API key.</p>
          <span className="add-source-card__cta">
            Open Steam library
            <ArrowRight size={15} />
          </span>
        </button>
      </div>

      <div className="add-source__note">
        <Sparkles size={14} />
        <span>Everything stays on this PC. Orca never uploads your library.</span>
      </div>
      <button className="add-source__manual" type="button" onClick={onManual}>
        Enter details manually
      </button>
    </div>
  )
}

export function AddGameModal(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const modal = useOrcaStore((state) => state.addGameModal)
  const close = useOrcaStore((state) => state.closeAddGame)
  const addGame = useOrcaStore((state) => state.addGame)
  const updateGame = useOrcaStore((state) => state.updateGame)
  const addToast = useOrcaStore((state) => state.addToast)
  const openSteamImport = useOrcaStore((state) => state.openSteamImport)
  const game = modal.gameId ? snapshot?.games.find((item) => item.id === modal.gameId) ?? null : null
  const isEdit = Boolean(game)

  const [form, setForm] = useState<FormState>(() => (game ? formFromGame(game) : emptyForm()))
  const [tab, setTab] = useState<'details' | 'launch' | 'artwork'>('details')
  const [step, setStep] = useState<'source' | 'form'>(isEdit ? 'form' : 'source')
  const [saving, setSaving] = useState(false)
  const [autoArtwork, setAutoArtwork] = useState<'idle' | 'searching' | 'done'>('idle')
  const [scanning, setScanning] = useState(false)
  const [scanCandidates, setScanCandidates] = useState<ScanCandidate[] | null>(null)
  const [scanFolderName, setScanFolderName] = useState('')
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
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
        launchArguments: form.launchArguments || choice.launchArguments,
        watchProcess: form.watchProcess || choice.executablePath.split(/[\\/]/).pop() || ''
      })
      setStep('form')
    } catch (caught) {
      setError(cleanErrorMessage(caught))
    }
  }

  const scanForGames = async (): Promise<void> => {
    if (scanning) return
    setScanning(true)
    setError('')
    setScanCandidates(null)
    try {
      const result = await window.orca.scanFolder()
      if (!result) return
      setScanFolderName(result.folder)
      setScanCandidates(result.candidates)
      setSelectedCandidates(new Set())
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
    }, 350)
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
      heroArt: candidate.heroArt ?? form.heroArt,
      watchProcess: candidate.name
    })
    setStep('form')
    setScanCandidates(null)
  }

  const toggleCandidate = (candidate: ScanCandidate): void => {
    setSelectedCandidates((current) => {
      const next = new Set(current)
      if (next.has(candidate.executablePath)) next.delete(candidate.executablePath)
      else next.add(candidate.executablePath)
      return next
    })
  }

  const selectAllCandidates = (): void => {
    if (!scanCandidates) return
    setSelectedCandidates((current) =>
      current.size === scanCandidates.length
        ? new Set()
        : new Set(scanCandidates.map((candidate) => candidate.executablePath))
    )
  }

  const addSelectedCandidates = async (): Promise<void> => {
    if (!scanCandidates || selectedCandidates.size === 0 || saving) return
    setSaving(true)
    setError('')
    let added = 0
    const failures: string[] = []
    for (const candidate of scanCandidates) {
      if (!selectedCandidates.has(candidate.executablePath)) continue
      try {
        await window.orca.addGame({
          title: candidate.suggestedTitle,
          executablePath: candidate.executablePath,
          workingDirectory: candidate.directory,
          watchProcess: candidate.name,
          coverArt: candidate.coverArt,
          heroArt: candidate.heroArt
        })
        added += 1
      } catch (caught) {
        failures.push(`${candidate.suggestedTitle}: ${cleanErrorMessage(caught)}`)
      }
    }
    setSaving(false)
    if (added > 0) {
      addToast(`${added} ${added === 1 ? 'game' : 'games'} added to your library.`, 'success')
      close()
    }
    if (failures.length > 0) {
      setError(failures.slice(0, 2).join(' '))
    }
  }

  const findArtworkForForm = async (): Promise<{ coverArt: string | null; heroArt: string | null }> => {
    const title = form.title.trim()
    if (!title) return { coverArt: null, heroArt: null }
    setAutoArtwork('searching')
    try {
      const result = await window.orca.fetchArtwork(title)
      const candidate =
        result.candidates.find((item) => item.source === 'steam' && item.coverUrl) ?? result.candidates[0]
      if (!candidate) return { coverArt: null, heroArt: null }
      let coverArt: string | null = null
      let heroArt: string | null = null
      if (candidate.coverUrl) coverArt = await window.orca.importArtworkUrl(candidate.coverUrl, 'cover')
      if (candidate.heroUrl) heroArt = await window.orca.importArtworkUrl(candidate.heroUrl, 'hero')
      if (candidate.developer && !form.developer.trim()) patch({ developer: candidate.developer })
      if (candidate.releaseYear && !form.releaseYear.trim()) patch({ releaseYear: candidate.releaseYear })
      if (candidate.summary && !form.description.trim()) patch({ description: candidate.summary })
      if (candidate.genres?.length && !form.genresText.trim()) patch({ genresText: candidate.genres.join(', ') })
      return { coverArt, heroArt }
    } catch {
      return { coverArt: null, heroArt: null }
    } finally {
      setAutoArtwork('done')
    }
  }

  const handleCreateSave = async (): Promise<void> => {
    if (!form.title.trim()) {
      setError('Give this game a name.')
      return
    }
    if (!form.executablePath.trim()) {
      setError('Choose the game executable.')
      return
    }

    setSaving(true)
    setError('')
    try {
      let coverArt = form.coverArt
      let heroArt = form.heroArt
      if (!coverArt) {
        const artwork = await findArtworkForForm()
        coverArt = artwork.coverArt ?? coverArt
        heroArt = artwork.heroArt ?? heroArt
      }
      const payload = { ...payloadFromForm(form), coverArt, heroArt }
      const created = await addGame(payload)
      if (created) close()
    } finally {
      setSaving(false)
    }
  }

  const handleEditSave = async (): Promise<void> => {
    if (!game) return
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

    setSaving(true)
    setError('')
    try {
      const updated = await updateGame({ ...payloadFromForm(form), id: game.id })
      if (!updated) return
      addToast('Game details saved.', 'success')
      close()
    } finally {
      setSaving(false)
    }
  }

  const handleFindArtwork = async (): Promise<void> => {
    if (!form.title.trim()) {
      setError('Add a title first so Orca can search for artwork.')
      return
    }
    setError('')
    const artwork = await findArtworkForForm()
    if (artwork.coverArt) patch({ coverArt: artwork.coverArt })
    if (artwork.heroArt) patch({ heroArt: artwork.heroArt })
    if (!artwork.coverArt && !artwork.heroArt) {
      addToast('No artwork could be downloaded. You can add it manually.')
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) close()
      }}
    >
      <section
        className={`add-game-modal ${!isEdit && step === 'source' ? 'add-game-modal--source' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-game-title"
      >
        <header className="add-game-modal__header">
          <div>
            <span className="eyebrow">
              <span className="eyebrow__line" />
              {isEdit ? 'Refine the record' : step === 'source' ? 'New arrival' : 'Almost there'}
            </span>
            <h2 id="add-game-title">
              {isEdit ? 'Edit game' : step === 'source' ? 'Add a game' : 'Name your game'}
            </h2>
          </div>
          <button className="modal-close" type="button" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {isEdit ? (
          <div className="add-game-modal__body">
            <ArtEditor form={form} patch={patch} onFindArtwork={() => void handleFindArtwork()} />

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
                  <Images size={14} />
                  Artwork
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
                          onChange={(event) =>
                            patch({ releaseYear: event.target.value.replace(/\D/g, '').slice(0, 4) })
                          }
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
                      const failed: string[] = []
                      if (candidate.coverUrl) {
                        const key = await window.orca.importArtworkUrl(candidate.coverUrl, 'cover')
                        if (key) coverKey = key
                        else failed.push('cover')
                      }
                      if (candidate.heroUrl) {
                        const key = await window.orca.importArtworkUrl(candidate.heroUrl, 'hero')
                        if (key) heroKey = key
                        else failed.push('hero')
                      }
                      patch({
                        title: candidate.title || form.title,
                        developer: candidate.developer || form.developer,
                        releaseYear: candidate.releaseYear || form.releaseYear,
                        description: candidate.summary || form.description,
                        genresText:
                          candidate.genres && candidate.genres.length > 0
                            ? candidate.genres.join(', ')
                            : form.genresText,
                        coverArt: coverKey,
                        heroArt: heroKey
                      })
                      if (failed.length > 0) {
                        throw new Error(
                          `Details were filled, but the ${failed.join(' and ')} artwork could not be downloaded.`
                        )
                      }
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
                  <button className="button button--primary" type="button" onClick={() => void handleEditSave()} disabled={saving}>
                    {saving ? <LoaderCircle size={15} className="spin" /> : null}
                    Save changes
                  </button>
                </div>
              </footer>
            </div>
          </div>
        ) : step === 'source' ? (
          <div className="add-game-modal__source">
            <SourceChooser
              scanning={scanning}
              scanCandidates={scanCandidates}
              scanFolderName={scanFolderName}
              selectedCandidates={selectedCandidates}
              onToggleCandidate={toggleCandidate}
              onSelectAll={selectAllCandidates}
              onUseCandidate={applyCandidate}
              onAddSelected={() => void addSelectedCandidates()}
              onCloseCandidates={() => setScanCandidates(null)}
              onChooseExecutable={() => void chooseExecutable()}
              onScan={() => void scanForGames()}
              onImportSteam={() => {
                close()
                openSteamImport()
              }}
              onManual={() => setStep('form')}
            />
            {error && <div className="form-error form-error--source">{error}</div>}
          </div>
        ) : (
          <CreateGameForm
            form={form}
            patch={patch}
            onBackToSource={() => {
              setStep('source')
              setScanCandidates(null)
            }}
            onChooseExecutable={() => void chooseExecutable()}
            onScan={() => void scanForGames()}
            onImportSteam={() => {
              close()
              openSteamImport()
            }}
            onSave={() => void handleCreateSave()}
            saving={saving}
            autoArtwork={autoArtwork}
            error={error}
          />
        )}
      </section>
    </div>
  )
}

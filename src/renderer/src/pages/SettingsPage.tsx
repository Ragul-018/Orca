import {
  Download,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Image,
  Keyboard,
  MonitorUp,
  Power,
  RotateCcw,
  ShieldCheck,
  Timer,
  Volume2,
  VolumeX,
  LayoutDashboard,
  RefreshCw
} from 'lucide-react'
import { useState } from 'react'
import type { Settings, UpdateStatus } from '@shared/types'
import { useOrcaStore } from '../store'
import { Logo, OrcaMark } from '../components/Logo'

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}): React.JSX.Element {
  const playSound = useOrcaStore((state) => state.playSound)
  return (
    <button
      className={`toggle ${checked ? 'is-on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        playSound('toggle')
        onChange(!checked)
      }}
    >
      <span className="toggle__thumb" />
    </button>
  )
}

interface SettingRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function SettingRow({ title, description, checked, onChange }: SettingRowProps): React.JSX.Element {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

interface VolumeSliderProps {
  value: number
  disabled: boolean
  onChange: (value: number) => void
}

function VolumeSlider({ value, disabled, onChange }: VolumeSliderProps): React.JSX.Element {
  const playSound = useOrcaStore((state) => state.playSound)
  const [hover, setHover] = useState(false)

  return (
    <div
      className="volume-slider"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      aria-disabled={disabled}
    >
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => !disabled && onChange(parseFloat(e.target.value))}
        onPointerUp={() => !disabled && playSound('toggle')}
        onKeyUp={() => !disabled && playSound('toggle')}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label="Sound volume"
      />
      <span className="volume-slider__icon" aria-hidden="true">
        {value === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </span>
      <span className={`volume-slider__value ${hover ? 'is-visible' : ''}`}>
        {Math.round(value * 100)}%
      </span>
    </div>
  )
}

export function SettingsPage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const updateSettings = useOrcaStore((state) => state.updateSettings)
  const exportBackup = useOrcaStore((state) => state.exportBackup)
  const restoreBackup = useOrcaStore((state) => state.restoreBackup)
  const openDataFolder = useOrcaStore((state) => state.openDataFolder)
  const checkForUpdates = useOrcaStore((state) => state.checkForUpdates)
  const downloadUpdate = useOrcaStore((state) => state.downloadUpdate)
  const installUpdate = useOrcaStore((state) => state.installUpdate)
  const updateStatus = useOrcaStore((state) => state.updateStatus)
  const controllerConnected = useOrcaStore((state) => state.controllerConnected)
  const playSound = useOrcaStore((state) => state.playSound)

  if (!snapshot) return <></>
  const settings: Settings = snapshot.settings
  const set = (patch: Partial<Settings>): void => {
    void updateSettings(patch)
  }

  const statusLabels: Record<UpdateStatus['state'], string> = {
    idle: 'Not checked',
    checking: 'Checking…',
    'up-to-date': 'Up to date',
    available: 'Update available',
    downloading: 'Downloading…',
    ready: 'Ready to install',
    error: 'Error',
    unsupported: 'Unsupported in dev build'
  }

  return (
    <div className="page settings-page page-enter">
      <header className="page-header settings-header">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__line" />
            The control room
          </span>
          <h1>Settings</h1>
          <p className="page-header__subtitle">Make Orca feel at home.</p>
        </div>
        <div className="settings-header__mark">
          <Logo compact />
        </div>
      </header>

      <div className="settings-layout">
        <div className="settings-main">
          <section className="panel settings-panel">
            <div className="settings-panel__heading">
              <span className="setting-icon">
                <LayoutDashboard size={17} />
              </span>
              <div>
                <h2>Interface</h2>
                <p>Sound, motion, and visual preferences.</p>
              </div>
            </div>
            <SettingRow
              title="Sound effects"
              description="Play subtle audio cues for navigation, actions, and notifications."
              checked={settings.soundEnabled}
              onChange={(value) => set({ soundEnabled: value })}
            />
            <div className="setting-row">
              <div>
                <strong>Sound volume</strong>
                <p>Adjust the volume of all interface sounds.</p>
              </div>
              <VolumeSlider
                value={settings.soundVolume}
                disabled={!settings.soundEnabled}
                onChange={(value) => set({ soundVolume: value })}
              />
            </div>
            <SettingRow
              title="Reduce motion"
              description="Respect your system's Reduce Motion preference. Disables most animations and transitions."
              checked={settings.reduceMotion}
              onChange={(value) => set({ reduceMotion: value })}
            />
          </section>

          <section className="panel settings-panel">
            <div className="settings-panel__heading">
              <span className="setting-icon">
                <MonitorUp size={17} />
              </span>
              <div>
                <h2>Gameplay</h2>
                <p>How Orca behaves when a game starts and stops.</p>
              </div>
            </div>
            <SettingRow
              title="Minimize when a game starts"
              description="Get out of the way as soon as your game takes over the screen."
              checked={settings.minimizeOnLaunch}
              onChange={(value) => set({ minimizeOnLaunch: value })}
            />
            <SettingRow
              title="Confirm before stopping a game"
              description="Ask before ending a process and closing the current session."
              checked={settings.confirmStopGame}
              onChange={(value) => set({ confirmStopGame: value })}
            />
            <SettingRow
              title="Show playtime on game cards"
              description="Keep your total hours visible across the library grid."
              checked={settings.showPlaytimeOnCards}
              onChange={(value) => set({ showPlaytimeOnCards: value })}
            />
            <SettingRow
              title="Controller navigation"
              description="Browse the whole interface with a gamepad. D-pad or left stick moves focus, A selects, X plays or stops, Y favorites, and B goes back."
              checked={settings.gamepadEnabled}
              onChange={(value) => set({ gamepadEnabled: value })}
            />
            <SettingRow
              title="Couch mode"
              description="Larger type, roomier controls, and a stronger focus ring for playing from the sofa or a TV."
              checked={settings.couchMode}
              onChange={(value) => set({ couchMode: value })}
            />
            <div className="settings-note">
              <Gamepad2 size={15} />
              <span>
                {controllerConnected
                  ? 'A controller is connected and ready.'
                  : 'Connect a controller, then press any button to wake it up.'}
              </span>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="settings-panel__heading">
              <span className="setting-icon">
                <Timer size={17} />
              </span>
              <div>
                <h2>Tracking</h2>
                <p>Orca watches Windows process activity only. It never touches your games.</p>
              </div>
            </div>
            <SettingRow
              title="Track games launched outside Orca"
              description="Watch for games you start from the desktop or another launcher. Keep Orca running in the tray."
              checked={settings.trackExternalGames}
              onChange={(value) => set({ trackExternalGames: value })}
            />
            <div className="settings-note">
              <ShieldCheck size={15} />
              <span>No injection, no overlays, no anti-cheat interference.</span>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="settings-panel__heading">
              <span className="setting-icon">
                <Image size={17} />
              </span>
              <div>
                <h2>Artwork & Metadata</h2>
                <p>Fetch high-definition covers and hero backdrops for your games automatically.</p>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong>Steam Store Search</strong>
                <p>Active out-of-the-box. Fetches official 600x900 covers & widescreen hero banners for PC games with zero setup.</p>
              </div>
              <span className="badge badge--success" style={{ alignSelf: 'center', padding: '4px 10px', fontSize: '0.8rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: 600 }}>
                Ready (0 keys needed)
              </span>
            </div>

            <div className="setting-row">
              <div>
                <strong>IGDB (Twitch Developer API)</strong>
                <p>The gold standard database for game covers, 1080p hero art, developers, and summaries. Create free app credentials at <strong>dev.twitch.tv/console/apps</strong>.</p>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <strong style={{ fontSize: '0.85rem' }}>IGDB Client ID</strong>
                <p>From your Twitch Developer console.</p>
              </div>
              <input
                className="text-input text-input--inline"
                type="text"
                value={settings.igdbClientId}
                onChange={(e) => set({ igdbClientId: e.target.value })}
                onBlur={(e) => set({ igdbClientId: e.target.value.trim() })}
                placeholder="Twitch Client ID…"
                aria-label="IGDB Client ID"
                spellCheck={false}
              />
            </div>

            <div className="setting-row">
              <div>
                <strong style={{ fontSize: '0.85rem' }}>IGDB Client Secret</strong>
                <p>Generated secret from your Twitch Developer app.</p>
              </div>
              <input
                className="text-input text-input--inline"
                type="password"
                value={settings.igdbClientSecret}
                onChange={(e) => set({ igdbClientSecret: e.target.value })}
                onBlur={(e) => set({ igdbClientSecret: e.target.value.trim() })}
                placeholder="Twitch Client Secret…"
                aria-label="IGDB Client Secret"
                spellCheck={false}
              />
            </div>

            <div className="setting-row">
              <div>
                <strong>RAWG API Key (Optional)</strong>
                <p>Fallback key if RAWG is accessible. Stored locally.</p>
              </div>
              <input
                className="text-input text-input--inline"
                type="password"
                value={settings.rawgApiKey}
                onChange={(e) => set({ rawgApiKey: e.target.value })}
                onBlur={(e) => set({ rawgApiKey: e.target.value.trim() })}
                placeholder="Paste RAWG API key…"
                aria-label="RAWG API key"
                spellCheck={false}
              />
            </div>

            <div className="settings-note">
              <ShieldCheck size={15} />
              <span>All API credentials stay strictly on your local machine and are never shared.</span>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="settings-panel__heading">
              <span className="setting-icon">
                <Power size={17} />
              </span>
              <div>
                <h2>System</h2>
                <p>Choose how Orca lives on your machine.</p>
              </div>
            </div>
            <SettingRow
              title="Start Orca with Windows"
              description="Open quietly in the tray when you sign in. Applied in the installed app."
              checked={settings.launchAtStartup}
              onChange={(value) => set({ launchAtStartup: value })}
            />
            <SettingRow
              title="Close to the system tray"
              description="Keep tracking playtime when you close the main window."
              checked={settings.closeToTray}
              onChange={(value) => set({ closeToTray: value })}
            />
            <SettingRow
              title="Check for updates automatically"
              description="Orca will check for updates in the background after launch and notify you when a new version is ready."
              checked={settings.autoCheckUpdates}
              onChange={(value) => set({ autoCheckUpdates: value })}
            />
          </section>

        </div>

        <aside className="settings-side">
          <section className="panel settings-data">
            <span className="setting-icon">
              <HardDrive size={17} />
            </span>
            <h2>Your data</h2>
            <p>
              Everything stays on this machine. Artwork, play sessions, and library metadata live in your
              Orca data folder.
            </p>
            <code title={snapshot.dataDirectory}>{snapshot.dataDirectory}</code>
            <div className="settings-data__actions">
              <button className="button button--glass" type="button" onClick={() => void openDataFolder()}>
                <FolderOpen size={15} />
                Open folder
              </button>
              <button className="button button--glass" type="button" onClick={() => void exportBackup()}>
                <Download size={15} />
                Export backup
              </button>
              <button className="button button--glass" type="button" onClick={() => void restoreBackup()}>
                <RotateCcw size={15} />
                Restore backup
              </button>
            </div>
          </section>

          <section className="panel settings-shortcuts">
            <div className="settings-panel__heading settings-panel__heading--small">
              <span className="setting-icon">
                <Keyboard size={17} />
              </span>
              <h2>Shortcuts</h2>
            </div>
            <div className="shortcut-row">
              <span>Search your library</span>
              <kbd>Ctrl K</kbd>
            </div>
            <div className="shortcut-row">
              <span>Close a window or overlay</span>
              <kbd>Esc</kbd>
            </div>
            <div className="shortcut-row">
              <span>Quit Orca</span>
              <kbd>Alt F4</kbd>
            </div>
          </section>

          <section className="settings-about">
            <span className="settings-about__mark">
              <OrcaMark size={44} />
            </span>
            <div>
              <strong>Orca</strong>
              <span>Version {snapshot.appVersion}</span>
            </div>
            <p>Your games, one quiet place.</p>
            <div className="settings-about__legal">
              <span>Local-first</span>
              <span>No account</span>
              <span>No telemetry</span>
            </div>

            <div className="settings-about__updates" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Update status</strong>
                  <span
                    className={`badge ${updateStatus.state === 'ready' ? 'badge--success' : updateStatus.state === 'error' ? 'badge--error' : updateStatus.state === 'downloading' || updateStatus.state === 'checking' ? 'badge--info' : 'badge--muted'}`}
                    style={{
                      padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', fontWeight: 600, textTransform: 'capitalize',
                      background: updateStatus.state === 'ready' ? 'rgba(34, 197, 94, 0.15)' :
                                  updateStatus.state === 'error' ? 'rgba(239, 68, 68, 0.15)' :
                                  updateStatus.state === 'downloading' || updateStatus.state === 'checking' ? 'rgba(59, 130, 246, 0.15)' :
                                  'rgba(100, 116, 139, 0.15)',
                      color: updateStatus.state === 'ready' ? '#4ade80' :
                             updateStatus.state === 'error' ? '#f87171' :
                             updateStatus.state === 'downloading' || updateStatus.state === 'checking' ? '#60a5fa' :
                             '#94a3b8'
                    }}
                  >
                    {updateStatus.state === 'downloading' && updateStatus.percent !== undefined
                      ? `Downloading ${updateStatus.percent}%`
                      : statusLabels[updateStatus.state]}
                  </span>
                </div>
                {updateStatus.message && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>{updateStatus.message}</p>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="button button--glass"
                    type="button"
                    onClick={() => void checkForUpdates()}
                    disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <RefreshCw size={14} className={updateStatus.state === 'checking' ? 'spin' : undefined} />
                    {updateStatus.state === 'checking' ? 'Checking…' : 'Check for updates'}
                  </button>
                  {updateStatus.state === 'available' && (
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() => void downloadUpdate()}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Download update
                    </button>
                  )}
                  {updateStatus.state === 'ready' && (
                    <button
                      className="button button--primary"
                      type="button"
                      onClick={() => {
                            playSound('success')
                            void installUpdate()
                          }}
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Restart to install
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

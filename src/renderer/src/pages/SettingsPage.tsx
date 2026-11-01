import {
  Download,
  FolderOpen,
  HardDrive,
  Image,
  Keyboard,
  MonitorUp,
  Power,
  ShieldCheck,
  Timer
} from 'lucide-react'
import type { Settings } from '@shared/types'
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
  return (
    <button
      className={`toggle ${checked ? 'is-on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
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

export function SettingsPage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const updateSettings = useOrcaStore((state) => state.updateSettings)
  const exportBackup = useOrcaStore((state) => state.exportBackup)
  const openDataFolder = useOrcaStore((state) => state.openDataFolder)

  if (!snapshot) return <></>
  const settings: Settings = snapshot.settings
  const set = (patch: Partial<Settings>): void => {
    void updateSettings(patch)
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
          </section>
        </aside>
      </div>
    </div>
  )
}

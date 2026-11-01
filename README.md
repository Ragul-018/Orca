# Orca 🐋

> A local-first game library, launcher, and playtime tracker for Windows.  
> PlayStation-inspired visual identity. No account required. No telemetry.

---

## Features

- **Library** — Add games manually or scan a folder. Supports `.exe`, `.bat`, `.cmd`, `.lnk`, and `.url` shortcuts.
- **Artwork search** — Look up a title on Steam with no API key (IGDB and RAWG keys optional) and apply a match to fill the title, developer, year, genres, synopsis, cover, and hero artwork in one click.
- **PS5-style home** — Full-bleed artwork, a horizontal game rail, and playtime panels that stay out of the way.
- **Launcher** — Launches any Windows executable. Tracks the process tree so child processes count as playtime, and stops only the PIDs it started.
- **Playtime tracking** — Measures exact wall-clock time from launch to stop (or natural exit). Persisted immediately.
- **Stats dashboard** — Weekly bar chart, all-time totals, session log, and per-game history.
- **Favourites** — Star any game and filter the library down to it.
- **Search** — `Ctrl+K` fuzzy overlay, searches title, developer, and tags.
- **Settings** — Minimize on launch, close-to-tray, stop confirmation, external-game tracking toggle.
- **System tray** — Minimises to tray; right-click for quick launch, restore, and quit.
- **No cloud, no login** — All data lives in a single JSON file on your machine.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Windows | 10 x64 or later |
| Node.js | 20 LTS or later |
| pnpm | 9 or later |

> **Note:** Orca uses [koffi](https://koffi.dev/) for fast native Windows process enumeration (no PowerShell polling). The native binary is pre-bundled and does **not** require a C++ build toolchain.

---

## Quick Start (Development)

```powershell
# 1. Install dependencies
pnpm install

# 2. Start the dev server (hot-reload renderer + live main reload)
pnpm dev
```

The app window opens automatically. Press `Ctrl+K` to search, `Ctrl+Shift+I` to open DevTools.

---

## Build and Package

```powershell
# Type-check + compile only (no installer)
pnpm build

# Type-check + compile + build Windows installer + portable exe
pnpm build:win

# Type-check + compile + build win-unpacked directory only (faster, no installer)
pnpm build:dir
```

Outputs land in `release/`:

| File | Description |
|------|-------------|
| `Orca-1.0.0-x64.exe` | NSIS installer (per-user, optional install dir) |
| `Orca-1.0.0-portable.exe` | Single-file portable executable |
| `win-unpacked/Orca.exe` | Unpacked directory build for testing |

---

## Running the Packaged App

```powershell
# Via installer
.\release\Orca-1.0.0-x64.exe

# Via portable (runs in-place)
.\release\Orca-1.0.0-portable.exe

# Via unpacked directory (fastest for iteration)
.\release\win-unpacked\Orca.exe
```

---

## Data Location

By default Orca stores everything under Electron's `userData` directory:

```
%APPDATA%\Orca\
  data\
    library.json   <- games, settings, sessions (atomic writes)
    art\           <- imported artwork (png/jpg/webp/gif)
```

### Override with ORCA_USER_DATA

Set this environment variable **before** launching to redirect all data to a different directory.
Useful for running multiple isolated libraries, automated smoke tests, or keeping data on another drive.

```powershell
$env:ORCA_USER_DATA = "D:\MyGames\OrcaData"
.\release\win-unpacked\Orca.exe
```

The directory is created automatically if it does not exist.

---

## Smoke Tests

Orca ships a Playwright Electron smoke test that exercises the full add -> launch -> track -> persist flow.

### Against the built (dev) app

```powershell
pnpm build   # compile first if needed
pnpm smoke
```

### Against the packaged executable

```powershell
pnpm build:dir   # or pnpm build:win
pnpm smoke:pkg
```

The packaged runner accepts an explicit executable path too:
`node scripts/smoke.mjs release\win-unpacked\Orca.exe`. `ORCA_EXE` still overrides it.

Screenshots are saved to `%TEMP%\orca-smoke-<dev|packaged>\` after each run.
Test data is isolated to `%TEMP%\orca-smoke-<dev|packaged>-data\` and deleted at the start of each run.

**What the smoke test verifies:**

1. Preload API (`window.orca`) is present.
2. Empty state renders on first run.
3. Add-game modal accepts all fields and saves.
4. Home, Library, Game detail, Search overlay, Stats, and Settings pages all render.
5. Play button launches the target process.
6. `koffi` process-tree tracking fires the running chip.
7. Stop + confirm dialog closes immediately and finalises the session.
8. `playtimeMs` and `sessions` are persisted to `library.json`.
9. Stats page shows the recorded session.
10. No console errors or uncaught page errors throughout.

---

## Adding Games

### Manually

1. Click **Add game** (or the `+` button in the top bar).
2. Fill in the **Details** tab — title is the only required field.
3. Switch to **Launch setup** and paste or browse to the `.exe` path.
4. Optionally add launch arguments (e.g. `-windowed -novid`).
5. Click **Add to Orca**.

### Automatic artwork and details

1. Click **Add game** and type the game title.
2. Open the **Artwork** tab — Orca searches Steam automatically once a title is present.
3. Pick the closest match and click **Apply to game**. Title, developer, year, genres, synopsis, cover, and hero artwork are filled in together.
4. Use the separate **Cover** and **Hero** buttons if you only want one image.
5. Add optional IGDB credentials or a RAWG key under **Settings -> Artwork sources** for extra search coverage.

### Folder scan

1. Open **Settings**.
2. Click **Scan folder** and pick a directory.
3. Orca inspects every `.exe` / `.lnk` / `.url` it finds, resolves shortcuts, and extracts embedded icons as cover art.
4. Duplicates (matched by executable path) are skipped.

### Supported executable types

| Type | Notes |
|------|-------|
| `.exe` | Direct executable |
| `.lnk` | Windows shortcut — resolved to target |
| `.url` | Internet shortcut — target URI launched via shell.openExternal |
| `.bat` / `.cmd` | Batch files — launched via `cmd.exe /c` |

---

## Playtime Tracking

Orca tracks playtime by watching the **process tree** rooted at the launched PID.
A session ends when you click **Stop** or when the root process and all children exit naturally.

The total wall-clock duration (in milliseconds) is written to `library.json` atomically the moment a session ends.

### External-game tracking

Disabled by default. When enabled (Settings -> Tracking), Orca also watches for processes whose executable path matches a game already in your library, even if launched outside Orca.
Disable this if generic executables (e.g., `cmd.exe`) cause false positives.

### Session record format

```jsonc
{
  "id": "uuid",
  "gameId": "uuid",
  "startedAt": "2026-10-31T14:51:41.506Z",
  "endedAt": "2026-10-31T14:51:47.802Z",
  "durationMs": 6296,
  "source": "launcher",   // "launcher" | "external"
  "endReason": "stopped"  // "stopped" | "exited"
}
```

---

## Architecture

```
src/
  main/                  Electron main process (Node.js / ESM)
    index.ts             App lifecycle, IPC handlers, tray, custom protocol
    data-store.ts        JSON persistence, atomic writes, artwork import
    session-manager.ts   Launch, process-tree poll, session finalise
    processes-win32.ts   koffi-based Windows process snapshot
    scanner.ts           Folder scan, .lnk/.url resolution, icon extraction
  preload/               CJS bridge (sandbox: true)
    index.ts             -> out/preload/index.cjs
  renderer/              React + Vite SPA
    src/
      store/             Zustand store (single source of truth)
      pages/             HomePage, LibraryPage, GamePage, StatsPage, SettingsPage
      components/        GameCard, TopBar, AddGameModal, WeekChart, Toast ...
      styles/
        global.css       Full design system (tokens, layout, components)
  shared/                Types, constants, formatters (imported by main + renderer)
scripts/
  smoke.mjs              Playwright Electron smoke test
  make-icon.mjs          Generates build/icon.ico from resources/icon.png
```

### Custom artwork protocol

Artwork is served via the `orca-art://` scheme so the renderer can load local files without relaxing CSP or using `file://` URLs directly:

```
orca-art://art/<sha256-key>  ->  userData/data/art/<key>.{png,jpg,webp,gif}
```

### Data persistence

`DataStore` writes to `userData/data/library.json` using an atomic write pattern:
1. Serialise to JSON.
2. Write to `library.json.tmp`.
3. `fs.rename` (atomic on Windows NTFS) to `library.json`.

Corrupted or missing files fall back to an empty library on startup.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 45 |
| Renderer | React 19 + Vite 7 |
| Language | TypeScript 5.9 |
| Build pipeline | electron-vite 6 |
| State | Zustand 5 |
| Animations | Motion (Framer Motion) |
| Native APIs | koffi 3 (process snapshots) |
| Packaging | electron-builder 26 |
| Testing | Playwright Core |
| Font | Manrope Variable (@fontsource-variable) |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Open search overlay |
| `Escape` | Close overlay / modal |
| `Enter` (in search) | Navigate to first result |

---

## Known Limitations

- **Windows only.** `koffi` process enumeration uses the Win32 `TlHelp32` API. macOS/Linux are not supported.
- **No automatic game detection.** Steam, Epic, GOG, and Xbox App libraries are not auto-imported; add games manually or via folder scan.
- **External-process tracking false positives.** Generic executables (e.g., `cmd.exe`) can be mistakenly matched. Disable external tracking if this is a problem.
- **asar size.** The packaged `app.asar` is ~56 MB because some renderer-only dependencies are listed under `dependencies` rather than `devDependencies`. This does not affect functionality.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ORCA_USER_DATA` | Override Electron userData path (must be set before launch) |
| `ORCA_EXE` | Path to packaged `.exe`; switches `smoke.mjs` to packaged mode |

---

## License

MIT (c) 2026 Orca

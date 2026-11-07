import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const packagedExe = process.env.ORCA_EXE?.trim() || process.argv[2]?.trim()
const label = packagedExe ? 'packaged' : 'dev'
const outDir = path.join(os.tmpdir(), `orca-smoke-${label}`)
const dataDir = path.join(os.tmpdir(), `orca-smoke-${label}-data`)
await fs.rm(outDir, { recursive: true, force: true })
await fs.mkdir(outDir, { recursive: true })
await fs.rm(dataDir, { recursive: true, force: true })

// A synthetic Steam install lets the smoke test exercise the real import path
// without touching the machine's actual Steam library.
const fakeSteam = path.join(outDir, 'fake-steam')
const fakeLibrary = path.join(outDir, 'fake-library')
const fakeHollow = path.join(fakeSteam, 'steamapps', 'common', 'HollowKnight')
const fakePortal = path.join(fakeLibrary, 'steamapps', 'common', 'Portal2')
await fs.mkdir(fakeHollow, { recursive: true })
await fs.mkdir(fakePortal, { recursive: true })
await fs.mkdir(path.join(fakeLibrary, 'steamapps'), { recursive: true })
await fs.copyFile('C:\\Windows\\System32\\cmd.exe', path.join(fakeHollow, 'HollowKnight.exe'))
await fs.copyFile('C:\\Windows\\System32\\cmd.exe', path.join(fakePortal, 'Portal2.exe'))
const vdfPath = (value) => value.replace(/\\/g, '\\\\')
await fs.writeFile(
  path.join(fakeSteam, 'steamapps', 'libraryfolders.vdf'),
  `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${vdfPath(fakeSteam)}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${vdfPath(fakeLibrary)}"\n\t}\n}\n`
)
await fs.writeFile(
  path.join(fakeSteam, 'steamapps', 'appmanifest_367520.acf'),
  `"AppState"\n{\n\t"appid"\t\t"367520"\n\t"name"\t\t"Hollow Knight"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"HollowKnight"\n\t"SizeOnDisk"\t\t"9000000000"\n\t"LastPlayed"\t\t"1700000000"\n}\n`
)
await fs.writeFile(
  path.join(fakeLibrary, 'steamapps', 'appmanifest_620.acf'),
  `"AppState"\n{\n\t"appid"\t\t"620"\n\t"name"\t\t"Portal 2"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"Portal2"\n\t"SizeOnDisk"\t\t"12000000000"\n\t"LastPlayed"\t\t"1690000000"\n}\n`
)

const launchArgs = ['--no-sandbox', '--disable-gpu']
if (!packagedExe) launchArgs.push('.')
const executablePath = packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')

const app = await electron.launch({
  executablePath,
  args: launchArgs,
  cwd: root,
  env: { ...process.env, ORCA_USER_DATA: dataDir, ORCA_STEAM_PATH: fakeSteam }
})

const issues = []
const collect = (page) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') issues.push(`[console:${msg.type()}] ${msg.text()}`)
  })
  page.on('pageerror', (error) => issues.push(`[pageerror] ${error.message}`))
}
app.on('window', collect)

const page = await app.firstWindow()
collect(page)
const shot = async (name) => {
  await page.waitForTimeout(450)
  await page.screenshot({ path: path.join(outDir, `${name}.png`) })
  console.log(`shot ${name}`)
}

await page.waitForSelector('.app', { timeout: 20_000 })
await page.waitForTimeout(1200)

const emptyFirst = await page.locator('.empty-library').count()
console.log('empty first run:', emptyFirst > 0)
await shot('01-empty-home')

// Add a game through the real UI.
await page.getByRole('button', { name: 'Add your first game' }).click()
await page.waitForSelector('.add-game-modal')
await shot('02-add-source')

await page.getByRole('button', { name: 'Enter details manually' }).click()
await page.waitForSelector('.add-game-modal__body--quick')
await shot('02b-add-details')

await page.getByLabel('Game title').fill('Depth Charge')
await page.locator('.form-more summary').first().click()
await page.getByLabel('Developer').fill('Abyssal Works')
await page.getByLabel('Year').fill('2026')
await page.getByLabel('Genres').fill('Action, Arcade')
await page.getByLabel('Description').fill(
  'A bioluminescent arcade dive through collapsing trenches. Chase sonar echoes, dodge the dark, and surface with a record worth keeping.'
)
await page.getByLabel('Tags').fill('Arcade, Smoke test, Neon')
await page.getByRole('button', { name: '4 stars' }).click()
await page.getByRole('button', { name: 'Add to favorites' }).click()
await shot('03-add-details-filled')

await page.locator('.form-more summary').nth(1).click()
await page.getByLabel('Game executable').fill('C:\\Windows\\System32\\cmd.exe')
await page.getByLabel('Launch arguments').fill('/c ping -t 127.0.0.1')
await shot('04-add-launch')
await page.getByRole('button', { name: 'Add to Orca' }).click()
await page.waitForSelector('.add-game-modal', { state: 'detached' })
await page.waitForTimeout(900)
await shot('05-home-with-game')

const snapshotAfterAdd = await page.evaluate(() => window.orca.getSnapshot())
console.log('games after add:', snapshotAfterAdd.games.length, snapshotAfterAdd.games[0]?.title)

// Home-screen reordering and removal.
await page.evaluate(() =>
  window.orca.addGame({
    title: 'Second Dive',
    executablePath: 'C:\\Windows\\System32\\notepad.exe'
  })
)
await page.waitForFunction(
  () => document.querySelectorAll('.ps5-rail-card[data-game-id]').length === 2,
  undefined,
  { timeout: 10_000 }
)
const orderBefore = (await page.evaluate(() => window.orca.getSnapshot())).games.map((g) => g.id)
await page.keyboard.press('Alt+ArrowRight')
await page.waitForTimeout(900)
const orderAfter = (await page.evaluate(() => window.orca.getSnapshot())).games.map((g) => g.id)
console.log('reorder persisted:', orderAfter.join(' , ') !== orderBefore.join(' , '), orderAfter)
if (orderAfter.join(' , ') === orderBefore.join(' , ')) {
  issues.push('Alt+Arrow home reorder did not persist')
}
await shot('05b-home-reordered')

// Selecting a tile must not move any other tile (transform-only scaling).
const tileLefts = () =>
  page.$$eval('.ps5-rail-card[data-game-id]', (nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().left))
  )
const leftsBefore = await tileLefts()
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(400)
const leftsAfter = await tileLefts()
if (leftsBefore.join(',') !== leftsAfter.join(',')) {
  issues.push(`rail tiles shifted on selection: ${leftsBefore} -> ${leftsAfter}`)
}
console.log('rail layout stable:', leftsBefore.join(',') === leftsAfter.join(','))

// Dragging a tile onto another reorders it too.
await page
  .locator('.ps5-rail-card[data-game-id]')
  .nth(1)
  .dragTo(page.locator('.ps5-rail-card[data-game-id]').nth(0))
await page.waitForTimeout(1000)
const dragOrder = (await page.evaluate(() => window.orca.getSnapshot())).games.map((g) => g.title)
console.log('drag reorder:', dragOrder)
if (dragOrder[0] !== 'Depth Charge') issues.push(`drag reorder failed: ${dragOrder.join(', ')}`)

await page.getByRole('option', { name: /Second Dive/ }).click()
await page.getByRole('button', { name: 'Remove Second Dive from home' }).click()
await page.waitForSelector('.confirm-dialog')
await page.getByRole('button', { name: 'Remove game', exact: true }).click()
await page.waitForSelector('.confirm-dialog', { state: 'detached', timeout: 5_000 })
await page.waitForTimeout(900)
const afterRemove = await page.evaluate(() => window.orca.getSnapshot())
console.log('games after home remove:', afterRemove.games.length, afterRemove.games[0]?.title)
if (afterRemove.games.length !== 1 || afterRemove.games[0]?.title !== 'Depth Charge') {
  issues.push('home remove did not persist')
}

// Library page
await page.getByRole('button', { name: 'Library', exact: true }).click()
await page.waitForSelector('.game-grid')
await shot('06-library')

// Game page
await page.locator('.game-card').first().click()
await page.waitForSelector('.game-hero')
await shot('07-game-detail')

// Search overlay
await page.keyboard.press('Control+K')
await page.waitForSelector('.search-panel')
await page.locator('.search-panel input').fill('Depth')
await shot('08-search')
await page.keyboard.press('Enter')
await page.waitForTimeout(500)

// Playtime page before sessions
await page.getByRole('button', { name: 'Playtime', exact: true }).click()
await page.waitForTimeout(500)
await shot('09-stats-empty')

// Settings page
await page.getByRole('button', { name: 'Settings' }).click()
await page.waitForSelector('.settings-layout')
await shot('10-settings')

// Keep the window visible while the game launches.
await page.evaluate(() => window.orca.updateSettings({ minimizeOnLaunch: false, confirmStopGame: true }))
await page.waitForTimeout(400)

// Launch and track the test game.
await page.getByRole('button', { name: 'Library', exact: true }).click()
await page.waitForSelector('.game-grid')
await page.locator('.game-card').first().hover()
await page.getByRole('button', { name: 'Play Depth Charge' }).click()
await page.waitForSelector('.running-chip', { timeout: 20_000 })
await page.waitForTimeout(4500)
await shot('11-playing')

await page.getByRole('button', { name: 'Stop Depth Charge' }).click()
await page.waitForSelector('.confirm-dialog')
await shot('12-stop-confirm')
await page.getByRole('button', { name: 'Stop game', exact: true }).click()
await page.waitForSelector('.confirm-dialog', { state: 'detached', timeout: 5_000 })
await page.waitForSelector('.running-chip', { state: 'detached', timeout: 20_000 })
await page.waitForTimeout(1200)

// Give the library one more second, then inspect persistence.
const finalSnapshot = await page.evaluate(() => window.orca.getSnapshot())
const game = finalSnapshot.games.find((item) => item.title === 'Depth Charge')
console.log('playtimeMs:', game?.playtimeMs, 'sessions:', finalSnapshot.sessions.length)
console.log('session:', finalSnapshot.sessions[0])
if (!game || game.sessionCount < 1 || game.playtimeMs < 1000) {
  issues.push(`playtime was not persisted (playtimeMs=${game?.playtimeMs}, sessions=${finalSnapshot.sessions.length})`)
}

// Playtime page with data
await page.getByRole('button', { name: 'Playtime', exact: true }).click()
await page.waitForTimeout(700)
await shot('13-stats-with-playtime')

await page.getByRole('button', { name: 'Library', exact: true }).click()
await page.waitForSelector('.game-grid')
await shot('14-library-after-play')

// Steam import through the real UI against the synthetic Steam library.
await page.getByRole('button', { name: 'Import Steam', exact: true }).click()
await page.waitForSelector('.steam-modal')
await page.waitForSelector('.steam-row', { timeout: 30_000 })
const steamRows = await page.locator('.steam-row').count()
console.log('steam rows:', steamRows)
if (steamRows !== 2) issues.push(`expected 2 Steam rows, found ${steamRows}`)
await shot('15-steam-import')

await page.getByRole('button', { name: 'Select all' }).click()
await page.getByRole('button', { name: /Import 2 games/ }).click()
await page.waitForSelector('.steam-result', { timeout: 90_000 })
await shot('16-steam-imported')

const afterSteam = await page.evaluate(() => window.orca.getSnapshot())
const steamTitles = afterSteam.games.map((item) => item.title)
console.log('games after steam import:', steamTitles)
for (const title of ['Hollow Knight', 'Portal 2']) {
  if (!steamTitles.includes(title)) issues.push(`Steam import did not add ${title}`)
}
const importedSteamGame = afterSteam.games.find((item) => item.title === 'Hollow Knight')
if (!importedSteamGame?.steamAppId) issues.push('Steam app id was not persisted')
console.log('steam artwork downloaded:', Boolean(importedSteamGame?.coverArt))

await page.getByRole('button', { name: 'View library' }).click()
await page.waitForSelector('.game-grid')
await page.waitForTimeout(500)
await shot('17-library-with-steam')

// Mock a standard gamepad so the couch-mode layer can be exercised without hardware.
await page.evaluate(() => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  const pad = {
    connected: true,
    id: 'Orca Smoke Pad',
    index: 0,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons,
    timestamp: performance.now()
  }
  window.__orcaMockPad = pad
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true })
  window.dispatchEvent(new Event('gamepadconnected'))
})
await page.waitForSelector('.gamepad-hints', { timeout: 5_000 })
await shot('18-gamepad-hints')

const press = async (index, hold = 140) => {
  await page.evaluate((buttonIndex) => {
    window.__orcaMockPad.buttons[buttonIndex].pressed = true
  }, index)
  await page.waitForTimeout(hold)
  await page.evaluate((buttonIndex) => {
    window.__orcaMockPad.buttons[buttonIndex].pressed = false
  }, index)
  await page.waitForTimeout(160)
}

await press(5) // RB -> Playtime
await page.waitForSelector('.stats-page')
console.log('gamepad tab switch: stats')
await press(4) // LB -> Library
await page.waitForSelector('.library-page')

await page.locator('.game-card').first().focus()
const focusBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-game-id'))
await press(15) // D-pad right
const focusAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-game-id'))
console.log('gamepad focus moved:', focusBefore, '->', focusAfter)
if (!focusAfter) issues.push('gamepad focus did not land on a game card')
if (await page.locator('[data-gamepad-focus="true"]').count() === 0) {
  issues.push('gamepad focus ring was not applied')
}

await page.locator('.game-card').first().focus()
await press(0) // A -> open the focused game
await page.waitForSelector('.game-page', { timeout: 5_000 })
const favoriteBefore = await page.evaluate(() => window.orca.getSnapshot().then((s) => s.games[0].favorite))
await press(3) // Y -> favorite
const favoriteAfter = await page.evaluate(() => window.orca.getSnapshot().then((s) => s.games[0].favorite))
console.log('gamepad favorite toggle:', favoriteBefore, '->', favoriteAfter)
if (favoriteBefore === favoriteAfter) issues.push('gamepad favorite toggle did not persist')
await press(1) // B -> back
await page.waitForSelector('.library-page', { timeout: 5_000 })

// Home X should open details rather than toggle the game.
await press(4) // LB -> Home
await page.waitForSelector('.ps5-home', { timeout: 5_000 })
await page.locator('.ps5-rail-card[data-game-id]').first().focus()
await press(2) // X -> details
await page.waitForSelector('.game-page', { timeout: 5_000 })
console.log('gamepad X opens details: true')
await press(1) // B -> back home
await page.waitForSelector('.ps5-home', { timeout: 5_000 })
await shot('19-gamepad-navigated')

console.log('issues:', issues.length ? `\n${issues.join('\n')}` : '(none)')
console.log('screenshots:', outDir)
console.log('isolated data:', dataDir)

await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5_000))])
process.exit(issues.length ? 1 : 0)

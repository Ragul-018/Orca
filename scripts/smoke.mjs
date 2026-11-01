import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const packagedExe = process.env.ORCA_EXE?.trim()
const label = packagedExe ? 'packaged' : 'dev'
const outDir = path.join(os.tmpdir(), `orca-smoke-${label}`)
const dataDir = path.join(os.tmpdir(), `orca-smoke-${label}-data`)
await fs.rm(outDir, { recursive: true, force: true })
await fs.mkdir(outDir, { recursive: true })
await fs.rm(dataDir, { recursive: true, force: true })

const app = await electron.launch({
  executablePath: packagedExe || path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: packagedExe ? [] : ['.'],
  cwd: root,
  env: { ...process.env, ORCA_USER_DATA: dataDir }
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
await shot('02-add-details')

await page.getByLabel('Game title').fill('Depth Charge')
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

await page.getByRole('tab', { name: 'Launch setup' }).click()
await page.locator('.exe-picker input').fill('C:\\Windows\\System32\\cmd.exe')
await page.getByText('Launch arguments').locator('..').getByRole('textbox').fill('/c ping -t 127.0.0.1')
await shot('04-add-launch')
await page.getByRole('button', { name: 'Add to Orca' }).click()
await page.waitForSelector('.add-game-modal', { state: 'detached' })
await page.waitForTimeout(900)
await shot('05-home-with-game')

const snapshotAfterAdd = await page.evaluate(() => window.orca.getSnapshot())
console.log('games after add:', snapshotAfterAdd.games.length, snapshotAfterAdd.games[0]?.title)

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

console.log('issues:', issues.length ? `\n${issues.join('\n')}` : '(none)')
console.log('screenshots:', outDir)
console.log('isolated data:', dataDir)

await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 5_000))])
process.exit(issues.length ? 1 : 0)

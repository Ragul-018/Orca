// Capture README screenshots from a copy of the real Orca library.
// Usage: node scripts/capture-readme.mjs
import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const exe = process.env.ORCA_EXE || path.join(root, 'release', 'win-unpacked', 'Orca.exe')
const source = path.join(process.env.APPDATA, 'orca')
const dataDir = path.join(os.tmpdir(), 'orca-readme-data')
const outDir = path.join(root, 'docs', 'screenshots')

await fs.rm(dataDir, { recursive: true, force: true })
await fs.mkdir(dataDir, { recursive: true })
// Copy only Orca's library data; Chromium session files may be locked by a running app.
await fs.cp(path.join(source, 'data'), path.join(dataDir, 'data'), { recursive: true })
await fs.mkdir(outDir, { recursive: true })

const app = await electron.launch({
  executablePath: exe,
  cwd: root,
  env: { ...process.env, ORCA_USER_DATA: dataDir }
})

const page = await app.firstWindow()
await page.waitForSelector('.app', { timeout: 30_000 })
await page.waitForTimeout(1800)

// Dismiss the one-time What's New modal so it does not cover the screenshots.
const whatsNewClose = page.locator('.whats-new-close')
if ((await whatsNewClose.count()) > 0) {
  await whatsNewClose.click()
  await page.waitForTimeout(500)
}

const snapshot = await page.evaluate(() => window.orca.getSnapshot())
console.log(`library: ${snapshot.games.length} games, ${snapshot.sessions.length} sessions`)
console.log(snapshot.games.map((game) => game.title).join(', '))

const capture = async (name) => {
  await page.waitForTimeout(900)
  const buffer = await page.screenshot()
  await sharp(buffer)
    .resize({ width: 1600 })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(path.join(outDir, `${name}.jpg`))
  console.log(`captured ${name}.jpg`)
}

await page.waitForSelector('.ps5-home', { timeout: 20_000 })
await capture('home')

await page.getByRole('button', { name: 'Library', exact: true }).click()
await page.waitForSelector('.game-grid')
await capture('library')

await page.locator('.game-card').first().click()
await page.waitForSelector('.game-hero')
await capture('game-detail')

await page.getByRole('button', { name: 'Playtime', exact: true }).click()
await page.waitForSelector('.stats-page')
await capture('playtime')

await page.getByRole('button', { name: 'Orca home' }).click()
await page.waitForSelector('.ps5-home')
await page.keyboard.press('Control+K')
await page.waitForSelector('.search-panel')
await page.locator('.search-panel input').fill(snapshot.games[0]?.title ?? 'Metro')
await capture('search')

await app.close()
console.log(`done -> ${outDir}`)

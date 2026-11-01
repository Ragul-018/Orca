import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = process.cwd()
const buildDir = path.join(root, 'build')
const resourcesDir = path.join(root, 'resources')
const trayDir = path.join(resourcesDir, 'tray')
const iconTempDir = path.join(buildDir, 'icon-sizes')

const markPath =
  'M4.7 22.7c8.2.7 14.2-2.6 18.3-10.1l2.2-4.2c.8-1.5 3.1-1.2 3.4.5l.9 5.2c.2 1.4 1.2 2.5 2.5 3l4.4 1.5c-3.4 8.4-10.8 12.8-22.2 13.2l-9.5-.2 1.7-5.7c.4-1.3-1.1-2.4-2.1-1.5l-2.5 2.2 2.9-3.9Z'

function appIconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="120" y1="80" x2="900" y2="980" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0d2024"/>
      <stop offset="0.55" stop-color="#071014"/>
      <stop offset="1" stop-color="#030607"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(560 430) rotate(90) scale(440)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#45f0d0" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#45f0d0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="240" y1="250" x2="810" y2="790" gradientUnits="userSpaceOnUse">
      <stop stop-color="#b8fff2"/>
      <stop offset="0.48" stop-color="#45f0d0"/>
      <stop offset="1" stop-color="#17b9a1"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="228" fill="url(#bg)"/>
  <circle cx="512" cy="512" r="382" fill="url(#glow)"/>
  <circle cx="512" cy="512" r="354" fill="none" stroke="#45f0d0" stroke-opacity="0.14" stroke-width="2"/>
  <circle cx="512" cy="512" r="300" fill="none" stroke="#9fc6ff" stroke-opacity="0.07" stroke-width="2" stroke-dasharray="5 14"/>
  <g transform="translate(150 150) scale(18.1)">
    <path d="${markPath}" fill="url(#mark)"/>
    <circle cx="27.3" cy="14.1" r="1.15" fill="#061013"/>
    <path d="M10 31.8c4.8.6 8.8-.2 12-2.5" fill="none" stroke="#b8fff2" stroke-opacity="0.5" stroke-width="1.35" stroke-linecap="round"/>
  </g>
  <rect x="1" y="1" width="1022" height="1022" rx="227" fill="none" stroke="url(#rim)" stroke-width="2"/>
</svg>`
}

function traySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="mark" x1="10" y1="12" x2="56" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#c9fff6"/>
      <stop offset="0.5" stop-color="#45f0d0"/>
      <stop offset="1" stop-color="#21d9bd"/>
    </linearGradient>
  </defs>
  <g transform="translate(3 6) scale(1.48)">
    <path d="${markPath}" fill="url(#mark)"/>
    <circle cx="27.3" cy="14.1" r="1.15" fill="#061013"/>
  </g>
</svg>`
}

async function main() {
  await fs.mkdir(buildDir, { recursive: true })
  await fs.mkdir(trayDir, { recursive: true })
  await fs.mkdir(iconTempDir, { recursive: true })

  const iconBuffer = await sharp(Buffer.from(appIconSvg())).png().toBuffer()
  await fs.writeFile(path.join(resourcesDir, 'icon.png'), iconBuffer)

  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const iconPaths = []
  for (const size of sizes) {
    const target = path.join(iconTempDir, `icon-${size}.png`)
    await sharp(iconBuffer).resize(size, size, { kernel: 'lanczos3' }).png().toFile(target)
    iconPaths.push(target)
  }

  const icoBuffer = await pngToIco(iconPaths)
  await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer)

  const trayBuffer = await sharp(Buffer.from(traySvg())).png().toBuffer()
  await fs.writeFile(path.join(trayDir, 'tray.png'), trayBuffer)

  await fs.rm(iconTempDir, { recursive: true, force: true })

  console.log('Generated resources/icon.png, resources/tray/tray.png and build/icon.ico')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

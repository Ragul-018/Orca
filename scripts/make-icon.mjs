import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = process.cwd()
const buildDir = path.join(root, 'build')
const resourcesDir = path.join(root, 'resources')
const trayDir = path.join(resourcesDir, 'tray')
const iconTempDir = path.join(buildDir, 'icon-sizes')

// Source artwork: blue orca mark + "Orca" wordmark on white.
const sourcePath = path.join(buildDir, 'logo-source.png')

const BRAND = { r: 0, g: 105, b: 196 } // #0069C4, sampled from the artwork
const TILE_RADIUS_RATIO = 228 / 1024
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Crops the whale mark out of the artwork and rebuilds it as flat brand-colour
 * pixels with an alpha channel taken from the source luminance. The artwork is
 * a lossy raster of a two-tone logo, so deriving alpha and re-flattening onto a
 * single colour removes the compression fringing that would otherwise blur the
 * silhouette at 16-32px.
 */
async function extractMark() {
  const { data, info } = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels } = info

  const isInk = (x, y) => {
    const i = (y * W + x) * channels
    return Math.min(data[i], data[i + 1], data[i + 2]) < 235
  }

  // Row bands separate the mark (top) from the wordmark (bottom).
  const rowInk = new Array(H).fill(0)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (isInk(x, y)) rowInk[y]++
  }

  const bands = []
  let start = -1
  for (let y = 0; y < H; y++) {
    if (rowInk[y] > 0 && start === -1) start = y
    if (rowInk[y] === 0 && start !== -1) {
      bands.push([start, y - 1])
      start = -1
    }
  }
  if (start !== -1) bands.push([start, H - 1])
  if (bands.length < 2) throw new Error('Expected a mark band and a wordmark band in logo-source.png')

  const [topY, bottomY] = bands[0]
  let minX = W
  let maxX = -1
  for (let x = 0; x < W; x++) {
    for (let y = topY; y <= bottomY; y++) {
      if (isInk(x, y)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        break
      }
    }
  }

  const cropW = maxX - minX + 1
  const cropH = bottomY - topY + 1
  const out = Buffer.alloc(cropW * cropH * 4)

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y + topY) * W + (x + minX)) * channels
      // Ink is #0069C4 and the backdrop is white: the red channel alone is a
      // clean coverage ramp (255 = background, 0 = full ink).
      let alpha = 255 - data[src]
      if (alpha < 6) alpha = 0
      const dst = (y * cropW + x) * 4
      out[dst] = BRAND.r
      out[dst + 1] = BRAND.g
      out[dst + 2] = BRAND.b
      out[dst + 3] = alpha
    }
  }

  return { buffer: out, width: cropW, height: cropH }
}

/** Content width as a fraction of the canvas; small icons need a larger mark. */
function fitRatio(size) {
  if (size <= 20) return 0.86
  if (size <= 32) return 0.82
  if (size <= 64) return 0.76
  return 0.72
}

function roundedTile(renderSize, finalSize) {
  const radius = Math.round(renderSize * TILE_RADIUS_RATIO)
  const strokePx = finalSize <= 24 ? 0.5 : finalSize <= 64 ? 1 : 2
  const stroke = Math.max(strokePx * (renderSize / finalSize), 0.75)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderSize}" height="${renderSize}" viewBox="0 0 ${renderSize} ${renderSize}">
  <rect x="0.5" y="0.5" width="${renderSize - 1}" height="${renderSize - 1}" rx="${radius}" fill="#ffffff"/>
  <rect x="${stroke / 2}" y="${stroke / 2}" width="${renderSize - stroke}" height="${renderSize - stroke}" rx="${radius}" fill="none" stroke="#000000" stroke-opacity="0.09" stroke-width="${stroke}"/>
</svg>`
}

async function appIcon(size, mark) {
  // Render small frames at 4x and downsample: the SVG plate and the mark then
  // share one resampling pass, which keeps 16-32px edges clean without the
  // stair-stepping of a hard alpha cut.
  const render = size <= 64 ? size * 4 : size
  const inner = Math.round(render * fitRatio(size))
  const markPng = await sharp(mark.buffer, { raw: { width: mark.width, height: mark.height, channels: 4 } })
    .resize({ width: inner, height: inner, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer()

  const markMeta = await sharp(markPng).metadata()
  const left = Math.round((render - markMeta.width) / 2)
  const top = Math.round((render - markMeta.height) / 2)

  const composed = await sharp(Buffer.from(roundedTile(render, size)))
    .composite([{ input: markPng, left, top }])
    .png()
    .toBuffer()

  if (render === size) return composed
  return sharp(composed).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()
}

async function trayIcon(mark) {
  // The tray sits on a theme-dependent taskbar, so it reuses the app tile: the
  // white plate keeps the blue mark legible on both light and dark taskbars.
  return appIcon(32, mark)
}

async function main() {
  await fs.mkdir(buildDir, { recursive: true })
  await fs.mkdir(trayDir, { recursive: true })
  await fs.mkdir(iconTempDir, { recursive: true })

  const mark = await extractMark()
  console.log(`mark: ${mark.width}x${mark.height} (from logo-source.png)`)

  const master = await appIcon(1024, mark)
  await fs.writeFile(path.join(resourcesDir, 'icon.png'), master)

  const iconPaths = []
  for (const size of ICO_SIZES) {
    const target = path.join(iconTempDir, `icon-${size}.png`)
    await fs.writeFile(target, await appIcon(size, mark))
    iconPaths.push(target)
  }

  await fs.writeFile(path.join(buildDir, 'icon.ico'), await pngToIco(iconPaths))

  await fs.writeFile(path.join(trayDir, 'tray.png'), await trayIcon(mark))

  await fs.rm(iconTempDir, { recursive: true, force: true })

  console.log(
    `Generated resources/icon.png (1024), resources/tray/tray.png (32) and build/icon.ico (${ICO_SIZES.join(', ')})`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

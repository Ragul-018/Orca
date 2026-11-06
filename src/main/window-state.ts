import { app, BrowserWindow, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

const MIN_WIDTH = 1100
const MIN_HEIGHT = 720
const DEFAULTS: WindowState = { width: 1440, height: 900, maximized: false }

function stateFile(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(Math.min(max, Math.max(min, value)))
}

function intersectsDisplay(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return false
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapX = Math.min(state.x! + state.width, area.x + area.width) - Math.max(state.x!, area.x)
    const overlapY = Math.min(state.y! + state.height, area.y + area.height) - Math.max(state.y!, area.y)
    return overlapX >= 160 && overlapY >= 120
  })
}

export function loadWindowState(): WindowState {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Partial<WindowState>
    const state: WindowState = {
      width: clamp(parsed.width, MIN_WIDTH, 10000, DEFAULTS.width),
      height: clamp(parsed.height, MIN_HEIGHT, 10000, DEFAULTS.height),
      maximized: Boolean(parsed.maximized)
    }
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      state.x = Math.round(parsed.x)
      state.y = Math.round(parsed.y)
    }
    // Drop an off-screen position, e.g. after a monitor was unplugged.
    if (state.x !== undefined && state.y !== undefined && !intersectsDisplay(state)) {
      delete state.x
      delete state.y
    }
    return state
  } catch {
    return { ...DEFAULTS }
  }
}

export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const persist = (): void => {
    if (window.isDestroyed()) return
    const bounds = window.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: window.isMaximized()
    }
    try {
      const target = stateFile()
      const temp = `${target}.tmp`
      fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8')
      fs.renameSync(temp, target)
    } catch {
      // Window geometry is a convenience; never let it interrupt the app.
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 500)
  }

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('close', () => {
    if (timer) clearTimeout(timer)
    persist()
  })
}

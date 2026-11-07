import { useEffect } from 'react'
import { Gamepad2 } from 'lucide-react'
import type { View } from '../store'
import { useOrcaStore } from '../store'

type Direction = 'up' | 'down' | 'left' | 'right'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex="0"]'
].join(',')

const DEADZONE = 0.55
const REPEAT_DELAY = 360
const REPEAT_INTERVAL = 135
const GAMEPAD_FOCUS_ATTR = 'data-gamepad-focus'

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  const style = window.getComputedStyle(element)
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
  return !element.closest('[aria-hidden="true"]')
}

function focusScope(): HTMLElement {
  const overlays = [
    ...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')
  ].filter(isVisible)
  const overlay = overlays[overlays.length - 1]
  if (overlay) return overlay
  return document.querySelector<HTMLElement>('.app-main') ?? document.body
}

function focusableIn(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(isVisible)
}

function clearGamepadFocus(): void {
  for (const element of document.querySelectorAll<HTMLElement>(`[${GAMEPAD_FOCUS_ATTR}]`)) {
    element.removeAttribute(GAMEPAD_FOCUS_ATTR)
  }
}

function focusElement(element: HTMLElement): void {
  clearGamepadFocus()
  element.setAttribute(GAMEPAD_FOCUS_ATTR, 'true')
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function focusDefault(scope = focusScope()): boolean {
  const items = focusableIn(scope)
  if (items.length === 0) return false
  const preferred = items.find((element) => element.dataset.gamepadDefault === 'true')
  focusElement(preferred ?? items[0])
  return true
}

function focusedGameId(element: Element | null): string | null {
  if (!(element instanceof HTMLElement)) return null
  return element.closest<HTMLElement>('[data-game-id]')?.dataset.gameId ?? null
}

function moveFocus(direction: Direction): boolean {
  const scope = focusScope()
  const items = focusableIn(scope)
  if (items.length === 0) return false

  const active = document.activeElement instanceof HTMLElement && items.includes(document.activeElement)
    ? document.activeElement
    : null
  if (!active) return focusDefault(scope)

  const current = active.getBoundingClientRect()
  const currentX = current.left + current.width / 2
  const currentY = current.top + current.height / 2

  let best: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const item of items) {
    if (item === active) continue
    const rect = item.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const dx = x - currentX
    const dy = y - currentY

    const primary =
      direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy
    if (primary <= 4) continue

    const perpendicular = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = primary + perpendicular * 2.2
    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }

  if (!best) return false
  focusElement(best)
  return true
}

function toggleGame(gameId: string): void {
  const state = useOrcaStore.getState()
  const game = state.snapshot?.games.find((item) => item.id === gameId)
  if (!game) return
  if (state.activeSession?.gameId === gameId) {
    state.stopActiveSession()
    return
  }
  if (state.activeSession) {
    state.addToast(`Stop ${state.snapshot?.games.find((item) => item.id === state.activeSession?.gameId)?.title ?? 'the running game'} first.`)
    return
  }
  void state.launchGame(gameId)
}

function toggleFavorite(gameId: string): void {
  const state = useOrcaStore.getState()
  const game = state.snapshot?.games.find((item) => item.id === gameId)
  if (!game) return
  void state.setFavorite(game.id, !game.favorite)
}

function contextGameId(element: Element | null): string | null {
  const state = useOrcaStore.getState()
  return focusedGameId(element) ?? (state.view.name === 'game' ? state.view.gameId : null)
}

const TAB_ORDER: View['name'][] = ['home', 'library', 'stats', 'settings']

function cycleTab(delta: number): void {
  const state = useOrcaStore.getState()
  const current = state.view.name === 'game' ? 'library' : state.view.name
  const index = TAB_ORDER.indexOf(current)
  const next = TAB_ORDER[(index + delta + TAB_ORDER.length) % TAB_ORDER.length]
  state.navigate({ name: next } as View)
}

function handleButton(index: number): void {
  const state = useOrcaStore.getState()
  const active = document.activeElement
  const scope = focusScope()

  if (index === 0) {
    // A — activate the focused control, or launch the focused game tile.
    if (!active || !(active instanceof HTMLElement) || !scope.contains(active)) {
      focusDefault(scope)
      return
    }
    const railGameId = active.closest<HTMLElement>('.ps5-rail-card[data-game-id]')?.dataset.gameId
    if (railGameId) {
      toggleGame(railGameId)
      return
    }
    active.click()
    return
  }

  if (index === 1 || index === 8) {
    // B / View — close the top overlay, otherwise step back.
    if (state.confirm) {
      state.closeConfirm()
      return
    }
    if (state.searchOpen) {
      state.closeSearch()
      return
    }
    if (state.steamModalOpen) {
      state.closeSteamImport()
      return
    }
    if (state.addGameModal.open) {
      state.closeAddGame()
      return
    }
    if (state.view.name === 'game') {
      state.goBack()
      return
    }
    if (state.view.name !== 'home') state.navigate({ name: 'home' })
    return
  }

  if (index === 2) {
    // X — open details on Home, otherwise play or stop the game in focus.
    const gameId = contextGameId(active)
    if (!gameId) return
    if (state.view.name === 'home') state.openGame(gameId)
    else toggleGame(gameId)
    return
  }

  if (index === 3) {
    // Y — favorite the game in focus.
    const gameId = contextGameId(active)
    if (gameId) toggleFavorite(gameId)
    return
  }

  if (index === 4) {
    cycleTab(-1)
    return
  }

  if (index === 5) {
    cycleTab(1)
    return
  }

  if (index === 9) {
    // Menu — search the library.
    if (state.searchOpen) state.closeSearch()
    else state.openSearch()
  }
}

function readDirection(gamepad: Gamepad): Direction | null {
  const buttons = gamepad.buttons
  if (buttons[12]?.pressed) return 'up'
  if (buttons[13]?.pressed) return 'down'
  if (buttons[14]?.pressed) return 'left'
  if (buttons[15]?.pressed) return 'right'

  const x = gamepad.axes[0] ?? 0
  const y = gamepad.axes[1] ?? 0
  if (Math.abs(x) > Math.abs(y) && Math.abs(x) > DEADZONE) return x > 0 ? 'right' : 'left'
  if (Math.abs(y) > DEADZONE) return y > 0 ? 'down' : 'up'
  return null
}

export function GamepadLayer(): React.JSX.Element | null {
  const enabled = useOrcaStore((state) => state.snapshot?.settings.gamepadEnabled ?? true)
  const controllerConnected = useOrcaStore((state) => state.controllerConnected)
  const setControllerConnected = useOrcaStore((state) => state.setControllerConnected)
  const addToast = useOrcaStore((state) => state.addToast)
  const playSound = useOrcaStore((state) => state.playSound)
  const view = useOrcaStore((state) => state.view)
  const overlayOpen = useOrcaStore(
    (state) => Boolean(state.confirm) || state.searchOpen || state.steamModalOpen || state.addGameModal.open
  )

  useEffect(() => {
    if (!enabled) {
      setControllerConnected(false)
      clearGamepadFocus()
      return
    }

    let frame = 0
    let previousButtons: boolean[] = []
    let heldDirection: Direction | null = null
    let heldSince = 0
    let nextRepeatAt = 0
    let connectionKnown = false
    let connected = false

    const updateConnection = (next: boolean): void => {
      if (connectionKnown && connected === next) return
      connectionKnown = true
      connected = next
      setControllerConnected(next)
      if (next) {
        addToast('Controller connected. Couch mode is ready.', 'success')
        playSound('toggle')
        window.setTimeout(() => {
          if (document.activeElement === document.body || !document.activeElement) focusDefault()
        }, 120)
      } else {
        clearGamepadFocus()
      }
    }

    const onConnected = (): void => updateConnection(true)
    const onDisconnected = (): void => updateConnection(false)
    window.addEventListener('gamepadconnected', onConnected)
    window.addEventListener('gamepaddisconnected', onDisconnected)

    const loop = (): void => {
      frame = window.requestAnimationFrame(loop)
      const pads = navigator.getGamepads?.() ?? []
      const gamepad = [...pads].find((pad): pad is Gamepad => Boolean(pad?.connected))
      if (!gamepad) {
        updateConnection(false)
        previousButtons = []
        heldDirection = null
        return
      }

      updateConnection(true)

      const now = performance.now()
      const buttons = gamepad.buttons.map((button) => button.pressed)
      const previous = previousButtons
      const justPressed = (index: number): boolean => Boolean(buttons[index]) && !previous[index]
      previousButtons = buttons

      const direction = readDirection(gamepad)
      if (direction) {
        if (direction !== heldDirection) {
          heldDirection = direction
          heldSince = now
          nextRepeatAt = now + REPEAT_DELAY
          if (moveFocus(direction)) playSound('nav')
        } else if (now >= nextRepeatAt && now - heldSince >= REPEAT_DELAY) {
          nextRepeatAt = now + REPEAT_INTERVAL
          if (moveFocus(direction)) playSound('nav')
        }
      } else {
        heldDirection = null
      }

      for (const index of [0, 1, 2, 3, 4, 5, 8, 9]) {
        if (justPressed(index)) handleButton(index)
      }
    }

    frame = window.requestAnimationFrame(loop)

    const clearOnPointer = (): void => clearGamepadFocus()
    window.addEventListener('pointerdown', clearOnPointer)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
      window.removeEventListener('pointerdown', clearOnPointer)
    }
  }, [addToast, enabled, playSound, setControllerConnected])

  // When a new view or overlay appears, move the controller focus into it.
  useEffect(() => {
    if (!enabled || !controllerConnected) return
    const timer = window.setTimeout(() => {
      const scope = focusScope()
      if (!scope.contains(document.activeElement)) focusDefault(scope)
    }, 140)
    return () => window.clearTimeout(timer)
  }, [controllerConnected, enabled, overlayOpen, view])

  if (!controllerConnected || !enabled) return null

  const hints =
    view.name === 'home'
      ? [
          { button: 'D-pad', label: 'Browse' },
          { button: 'A', label: 'Play / stop' },
          { button: 'X', label: 'Details' },
          { button: 'Y', label: 'Favorite' },
          { button: 'LB / RB', label: 'Tabs' },
          { button: 'Menu', label: 'Search' }
        ]
      : view.name === 'library'
        ? [
            { button: 'D-pad', label: 'Move' },
            { button: 'A', label: 'Open' },
            { button: 'X', label: 'Play / stop' },
            { button: 'Y', label: 'Favorite' },
            { button: 'B', label: 'Home' },
            { button: 'LB / RB', label: 'Tabs' },
            { button: 'Menu', label: 'Search' }
          ]
        : view.name === 'game'
          ? [
              { button: 'D-pad', label: 'Move' },
              { button: 'A', label: 'Select' },
              { button: 'X', label: 'Play / stop' },
              { button: 'Y', label: 'Favorite' },
              { button: 'B', label: 'Back' },
              { button: 'LB / RB', label: 'Tabs' },
              { button: 'Menu', label: 'Search' }
            ]
          : [
              { button: 'D-pad', label: 'Move' },
              { button: 'A', label: 'Select' },
              { button: 'B', label: 'Back' },
              { button: 'LB / RB', label: 'Tabs' },
              { button: 'Menu', label: 'Search' }
            ]

  return (
    <div className="gamepad-hints" role="status" aria-label="Controller shortcuts">
      <span className="gamepad-hints__brand">
        <Gamepad2 size={15} />
        Controller
      </span>
      <span className="gamepad-hints__divider" />
      {hints.map((hint) => (
        <span className="gamepad-hint" key={hint.button}>
          <kbd className={`gamepad-key ${hint.button.length > 1 ? 'gamepad-key--wide' : ''}`}>{hint.button}</kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  )
}

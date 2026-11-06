import navSoundUrl from '../assets/playstation.mp3'

export type SoundName =
  | 'nav'
  | 'click'
  | 'toggle'
  | 'open'
  | 'close'
  | 'success'
  | 'error'
  | 'launch'
  | 'update'

let context: AudioContext | null = null
let master: GainNode | null = null
let enabled = true
let volume = 0.55
let navBuffer: AudioBuffer | null = null
let navLoading: Promise<void> | null = null
const lastPlayed = new Map<SoundName, number>()

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    context = new Ctor()
    master = context.createGain()
    master.gain.value = enabled ? volume : 0
    master.connect(context.destination)
  }
  return context
}

export function configureAudio(next: { enabled: boolean; volume: number }): void {
  enabled = next.enabled
  volume = Math.max(0, Math.min(1, next.volume))
  if (context && master) {
    master.gain.setTargetAtTime(enabled ? volume : 0, context.currentTime, 0.02)
  }
}

/** Called from the first user gesture so Chromium lets audio start. */
export function primeAudio(): void {
  const ctx = ensureContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  void loadNav(ctx)
}

function loadNav(ctx: AudioContext): Promise<void> {
  if (navBuffer) return Promise.resolve()
  if (navLoading) return navLoading
  navLoading = fetch(navSoundUrl)
    .then((response) => response.arrayBuffer())
    .then((buffer) => ctx.decodeAudioData(buffer))
    .then((decoded) => {
      navBuffer = decoded
    })
    .catch(() => undefined)
  return navLoading
}

interface ToneOptions {
  from: number
  to?: number
  duration: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

function tone(ctx: AudioContext, options: ToneOptions): void {
  if (!master) return
  const { from, to, duration, type = 'sine', gain = 0.06, delay = 0 } = options
  const start = ctx.currentTime + delay
  const oscillator = ctx.createOscillator()
  const envelope = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(from, start)
  if (to && to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, start + duration)
  envelope.gain.setValueAtTime(0.0001, start)
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(envelope).connect(master)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function playNav(ctx: AudioContext): void {
  if (!master) return
  if (!navBuffer) {
    void loadNav(ctx)
    tone(ctx, { from: 1250, to: 1500, duration: 0.05, gain: 0.05 })
    return
  }
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  source.buffer = navBuffer
  gain.gain.value = 0.85
  source.connect(gain).connect(master)
  source.start()
}

function render(ctx: AudioContext, name: SoundName): void {
  switch (name) {
    case 'nav':
      playNav(ctx)
      break
    case 'click':
      tone(ctx, { from: 1320, to: 1180, duration: 0.045, gain: 0.045 })
      break
    case 'toggle':
      tone(ctx, { from: 640, to: 880, duration: 0.07, gain: 0.055 })
      break
    case 'open':
      tone(ctx, { from: 420, to: 760, duration: 0.12, gain: 0.05 })
      break
    case 'close':
      tone(ctx, { from: 760, to: 380, duration: 0.11, gain: 0.045 })
      break
    case 'success':
      tone(ctx, { from: 587, duration: 0.12, gain: 0.05 })
      tone(ctx, { from: 880, duration: 0.14, gain: 0.05, delay: 0.085 })
      break
    case 'error':
      tone(ctx, { from: 220, to: 170, duration: 0.18, type: 'triangle', gain: 0.06 })
      break
    case 'launch':
      tone(ctx, { from: 190, to: 900, duration: 0.34, gain: 0.055 })
      tone(ctx, { from: 480, to: 1320, duration: 0.24, gain: 0.03, delay: 0.06 })
      break
    case 'update':
      tone(ctx, { from: 660, duration: 0.11, gain: 0.05 })
      tone(ctx, { from: 880, duration: 0.11, gain: 0.05, delay: 0.1 })
      tone(ctx, { from: 1175, duration: 0.16, gain: 0.045, delay: 0.2 })
      break
  }
}

export function playSound(name: SoundName): void {
  if (!enabled || volume <= 0) return
  const ctx = ensureContext()
  if (!ctx) return
  if (ctx.state !== 'running') {
    void ctx.resume()
    return
  }
  const now = performance.now()
  const previous = lastPlayed.get(name) ?? 0
  if (now - previous < 32) return
  lastPlayed.set(name, now)
  try {
    render(ctx, name)
  } catch {
    // Sound is decoration; never let it interrupt the interface.
  }
}

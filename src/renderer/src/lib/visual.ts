import type { Game, PlaySession } from '@shared/types'

export function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function gameHue(title: string): number {
  return 168 + (hashString(title) % 64)
}

export function gameAccent(title: string): string {
  return `hsl(${gameHue(title)} 85% 72%)`
}

export function initials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function computeWeek(sessions: PlaySession[], days = 7): { label: string; date: Date; ms: number }[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const result: { label: string; date: Date; ms: number }[] = []

  for (let index = days - 1; index >= 0; index -= 1) {
    const day = new Date(startOfToday)
    day.setDate(startOfToday.getDate() - index)
    const next = new Date(day)
    next.setDate(day.getDate() + 1)
    const ms = sessions
      .filter((session) => {
        const started = Date.parse(session.startedAt)
        return started >= day.getTime() && started < next.getTime()
      })
      .reduce((total, session) => total + session.durationMs, 0)
    result.push({
      label: day.toLocaleDateString(undefined, { weekday: 'short' }),
      date: day,
      ms
    })
  }
  return result
}

export function totalPlaytime(games: Game[]): number {
  return games.reduce((total, game) => total + game.playtimeMs, 0)
}

export function featuredGame(games: Game[], preferredId?: string): Game | null {
  if (!games.length) return null
  if (preferredId) {
    const preferred = games.find((game) => game.id === preferredId)
    if (preferred) return preferred
  }
  return (
    [...games]
      .filter((game) => !game.hidden)
      .sort((a, b) => {
        if (a.lastPlayedAt && b.lastPlayedAt) return Date.parse(b.lastPlayedAt) - Date.parse(a.lastPlayedAt)
        if (a.lastPlayedAt) return -1
        if (b.lastPlayedAt) return 1
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        return Date.parse(b.addedAt) - Date.parse(a.addedAt)
      })[0] ?? null
  )
}

export function recentGames(games: Game[], limit = 8): Game[] {
  return [...games]
    .filter((game) => !game.hidden && game.lastPlayedAt)
    .sort((a, b) => Date.parse(b.lastPlayedAt ?? '') - Date.parse(a.lastPlayedAt ?? ''))
    .slice(0, limit)
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function formatShortDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

import type { Game, PlaySession } from '@shared/types'

export interface DayBucket {
  key: string
  date: Date
  label: string
  ms: number
  sessions: number
}

export interface MonthBucket {
  key: string
  date: Date
  label: string
  ms: number
  sessions: number
}

export interface StreakSummary {
  current: number
  best: number
  playedDays: number
}

export interface SessionSummary {
  totalMs: number
  count: number
  averageMs: number
  longest: PlaySession | null
  first: PlaySession | null
  latest: PlaySession | null
  activeDays: number
}

export interface GamePlaytime {
  game: Game
  totalMs: number
  sessionCount: number
  averageMs: number
  lastPlayedAt: string | null
  firstPlayedAt: string | null
  share: number
}

export interface HeatCell {
  key: string
  date: Date
  ms: number
  sessions: number
  level: number
}

export interface TimeOfDayBucket {
  label: string
  ms: number
  sessions: number
}

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

export function dayKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function aggregateDays(sessions: PlaySession[]): Map<string, { ms: number; sessions: number }> {
  const days = new Map<string, { ms: number; sessions: number }>()
  for (const session of sessions) {
    const started = new Date(session.startedAt)
    if (Number.isNaN(started.getTime())) continue
    const key = dayKey(started)
    const current = days.get(key) ?? { ms: 0, sessions: 0 }
    current.ms += session.durationMs
    current.sessions += 1
    days.set(key, current)
  }
  return days
}

export function computeDailySeries(sessions: PlaySession[], days: number): DayBucket[] {
  const aggregate = aggregateDays(sessions)
  const today = startOfDay(new Date())
  const result: DayBucket[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset)
    const key = dayKey(date)
    const entry = aggregate.get(key)
    result.push({
      key,
      date,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      ms: entry?.ms ?? 0,
      sessions: entry?.sessions ?? 0
    })
  }
  return result
}

export function computeMonthlySeries(sessions: PlaySession[], months: number): MonthBucket[] {
  const aggregate = new Map<string, { ms: number; sessions: number }>()
  for (const session of sessions) {
    const started = new Date(session.startedAt)
    if (Number.isNaN(started.getTime())) continue
    const key = `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}`
    const current = aggregate.get(key) ?? { ms: 0, sessions: 0 }
    current.ms += session.durationMs
    current.sessions += 1
    aggregate.set(key, current)
  }

  const now = new Date()
  const result: MonthBucket[] = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const entry = aggregate.get(key)
    result.push({
      key,
      date,
      label: date.toLocaleDateString(undefined, { month: 'short' }),
      ms: entry?.ms ?? 0,
      sessions: entry?.sessions ?? 0
    })
  }
  return result
}

export function computeStreaks(sessions: PlaySession[]): StreakSummary {
  const played = new Set<string>()
  for (const session of sessions) {
    const started = new Date(session.startedAt)
    if (Number.isNaN(started.getTime())) continue
    played.add(dayKey(started))
  }

  const today = startOfDay(new Date())
  let cursor = played.has(dayKey(today)) ? today : addDays(today, -1)
  let current = 0
  while (played.has(dayKey(cursor))) {
    current += 1
    cursor = addDays(cursor, -1)
  }

  const ordered = [...played].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of ordered) {
    if (previous) {
      const previousDate = new Date(`${previous}T00:00:00`)
      const currentDate = new Date(`${key}T00:00:00`)
      const diff = Math.round((currentDate.getTime() - previousDate.getTime()) / 86_400_000)
      run = diff === 1 ? run + 1 : 1
    } else {
      run = 1
    }
    best = Math.max(best, run)
    previous = key
  }

  return { current, best, playedDays: played.size }
}

export function summarizeSessions(sessions: PlaySession[]): SessionSummary {
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)
  )
  const totalMs = sessions.reduce((total, session) => total + session.durationMs, 0)
  const longest = sessions.reduce<PlaySession | null>(
    (best, session) => (!best || session.durationMs > best.durationMs ? session : best),
    null
  )
  const activeDays = new Set(
    sessions.map((session) => {
      const started = new Date(session.startedAt)
      return Number.isNaN(started.getTime()) ? '' : dayKey(started)
    })
  )
  activeDays.delete('')

  return {
    totalMs,
    count: sessions.length,
    averageMs: sessions.length > 0 ? totalMs / sessions.length : 0,
    longest,
    first: ordered[0] ?? null,
    latest: ordered[ordered.length - 1] ?? null,
    activeDays: activeDays.size
  }
}

export function computeGamePlaytime(games: Game[], sessions: PlaySession[]): GamePlaytime[] {
  const totalMs = games.reduce((total, game) => total + game.playtimeMs, 0)
  const byGame = new Map<string, PlaySession[]>()

  for (const session of sessions) {
    const list = byGame.get(session.gameId) ?? []
    list.push(session)
    byGame.set(session.gameId, list)
  }

  return games
    .filter((game) => game.playtimeMs > 0)
    .map((game) => {
      const gameSessions = (byGame.get(game.id) ?? []).sort(
        (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)
      )
      const sessionCount = Math.max(game.sessionCount, gameSessions.length)
      return {
        game,
        totalMs: game.playtimeMs,
        sessionCount,
        averageMs: sessionCount > 0 ? game.playtimeMs / sessionCount : 0,
        lastPlayedAt: game.lastPlayedAt ?? gameSessions[gameSessions.length - 1]?.startedAt ?? null,
        firstPlayedAt: gameSessions[0]?.startedAt ?? null,
        share: totalMs > 0 ? game.playtimeMs / totalMs : 0
      }
    })
    .sort((a, b) => b.totalMs - a.totalMs)
}

export function computeHeatmap(sessions: PlaySession[], weeks = 26): HeatCell[][] {
  const aggregate = aggregateDays(sessions)
  const today = startOfDay(new Date())
  // Align the final column so today sits on its real weekday row.
  const end = addDays(today, 6 - today.getDay())
  const start = addDays(end, -(weeks * 7 - 1))
  const columns: HeatCell[][] = []

  for (let week = 0; week < weeks; week += 1) {
    const column: HeatCell[] = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(start, week * 7 + weekday)
      const key = dayKey(date)
      const entry = aggregate.get(key)
      const ms = entry?.ms ?? 0
      const level =
        ms <= 0 ? 0 : ms < 30 * 60_000 ? 1 : ms < 60 * 60_000 ? 2 : ms < 2 * 60 * 60_000 ? 3 : 4
      column.push({
        key,
        date,
        ms,
        sessions: entry?.sessions ?? 0,
        level: date.getTime() > today.getTime() ? -1 : level
      })
    }
    columns.push(column)
  }
  return columns
}

export function computeTimeOfDay(sessions: PlaySession[]): TimeOfDayBucket[] {
  const buckets: TimeOfDayBucket[] = [
    { label: 'Night', ms: 0, sessions: 0 },
    { label: 'Morning', ms: 0, sessions: 0 },
    { label: 'Afternoon', ms: 0, sessions: 0 },
    { label: 'Evening', ms: 0, sessions: 0 }
  ]

  for (const session of sessions) {
    const hour = new Date(session.startedAt).getHours()
    const index = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3
    buckets[index].ms += session.durationMs
    buckets[index].sessions += 1
  }
  return buckets
}

export function filterSessions(
  sessions: PlaySession[],
  filters: { gameId: string; source: string; endReason: string; query: string },
  games: Game[]
): PlaySession[] {
  const gameById = new Map(games.map((game) => [game.id, game]))
  const query = filters.query.trim().toLowerCase()

  return sessions.filter((session) => {
    if (filters.gameId !== 'all' && session.gameId !== filters.gameId) return false
    if (filters.source !== 'all' && session.source !== filters.source) return false
    if (filters.endReason !== 'all' && session.endReason !== filters.endReason) return false
    if (!query) return true
    const game = gameById.get(session.gameId)
    return `${game?.title ?? ''} ${session.processName ?? ''} ${session.source} ${session.endReason}`
      .toLowerCase()
      .includes(query)
  })
}

export function formatDuration(ms: number, options: { compact?: boolean; includeSeconds?: boolean } = {}): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (options.includeSeconds) {
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  }

  if (options.compact) {
    if (hours > 0) return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim()
    if (minutes > 0) return `${minutes}m`
    return totalSeconds > 0 ? '<1m' : '0m'
  }

  if (hours > 0) return `${hours} hr ${minutes > 0 ? `${minutes} min` : ''}`.trim()
  if (minutes > 0) return `${minutes} min`
  return 'Less than a minute'
}

export function formatPlaytime(ms: number): string {
  const hours = ms / 3_600_000
  if (hours >= 100) return `${Math.floor(hours)} hrs`
  if (hours >= 1) return `${hours.toFixed(hours >= 10 ? 0 : 1)} hrs`
  return formatDuration(ms, { compact: true })
}
export function formatRelativeDate(iso: string | null): string {
  if (!iso) return 'Never played'
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayDiff = Math.round((startOfToday - startOfDate) / 86_400_000)

  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return `${dayDiff} days ago`

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleFromPath(filePath: string): string {
  const segment = filePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? 'Untitled game'
  return segment
    .replace(/\.(exe|bat|cmd|lnk|url)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim()
}

export function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

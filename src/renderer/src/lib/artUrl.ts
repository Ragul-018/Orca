import { PROTOCOL } from '@shared/constants'

export function artUrl(key: string | null | undefined): string | undefined {
  if (!key) return undefined
  return `${PROTOCOL}://art/${encodeURIComponent(key)}`
}

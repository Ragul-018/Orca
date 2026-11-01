import type { OrcaApi } from '@shared/types'

declare global {
  interface Window {
    orca: OrcaApi
  }
}

export {}

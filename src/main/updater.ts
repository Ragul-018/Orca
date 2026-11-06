import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { IPC } from '@shared/constants'

// electron-updater ships as CommonJS; take the runtime object from the default
// export so the ESM main bundle can load it under Electron.
const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: 'idle' }
let active = false
let notify: (channel: string, payload: unknown) => void = () => undefined

function publish(next: UpdateStatus): UpdateStatus {
  status = next
  notify(IPC.updateStatus, status)
  return status
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'The update could not be completed.'
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

export function initUpdater(send: (channel: string, payload: unknown) => void): void {
  notify = send

  if (!app.isPackaged) {
    status = {
      state: 'unsupported',
      message: 'Automatic updates apply to the installed app, not the dev build.'
    }
    return
  }

  active = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => publish({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', (info) => publish({ state: 'up-to-date', version: info.version }))
  autoUpdater.on('download-progress', (progress) =>
    publish({ state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent))) })
  )
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => publish({ state: 'error', message: describe(error) }))
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!active) return status
  if (status.state === 'checking' || status.state === 'downloading') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    return publish({ state: 'error', message: describe(error) })
  }
  return status
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!active) return status
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return publish({ state: 'error', message: describe(error) })
  }
  return status
}

export function installUpdate(): void {
  if (status.state !== 'ready') return
  autoUpdater.quitAndInstall(false, true)
}

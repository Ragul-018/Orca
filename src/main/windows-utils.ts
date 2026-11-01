import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface ShortcutInfo {
  targetPath: string
  arguments: string
  workingDirectory: string
}

export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function psLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export async function runPowerShell(script: string, timeout = 30_000): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)],
    {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024
    }
  )
  if (stderr.trim()) {
    const meaningful = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#< CLIXML') && !line.includes('CategoryInfo'))
      .join(' ')
    if (meaningful && !stdout.trim()) throw new Error(meaningful)
  }
  return stdout.trim()
}

export async function resolveShortcut(shortcutPath: string): Promise<ShortcutInfo | null> {
  const script = [
    `$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut(${psLiteral(shortcutPath)})`,
    `[PSCustomObject]@{ target = $shortcut.TargetPath; arguments = $shortcut.Arguments; workingDirectory = $shortcut.WorkingDirectory } | ConvertTo-Json -Compress`
  ].join('; ')
  try {
    const output = await runPowerShell(script)
    if (!output) return null
    const parsed = JSON.parse(output) as {
      target?: string
      arguments?: string
      workingDirectory?: string
    }
    if (!parsed.target) return null
    return {
      targetPath: parsed.target,
      arguments: parsed.arguments ?? '',
      workingDirectory: parsed.workingDirectory || path.dirname(parsed.target)
    }
  } catch {
    return null
  }
}

export function parseArguments(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false
  let tokenStarted = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (char === '\\') {
      let slashCount = 0
      while (input[index] === '\\') {
        slashCount += 1
        index += 1
      }
      const next = input[index]
      if (next === '"') {
        current += '\\'.repeat(Math.floor(slashCount / 2))
        if (slashCount % 2 === 1) {
          current += '"'
          tokenStarted = true
        } else {
          inQuotes = !inQuotes
        }
      } else {
        current += '\\'.repeat(slashCount)
        index -= 1
      }
      tokenStarted = true
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      tokenStarted = true
      continue
    }

    if (/\s/.test(char) && !inQuotes) {
      if (tokenStarted) {
        args.push(current)
        current = ''
        tokenStarted = false
      }
      continue
    }

    current += char
    tokenStarted = true
  }

  if (tokenStarted) args.push(current)
  return args
}

export interface SpawnedGame {
  pid: number
}

async function spawnElevated(
  executablePath: string,
  args: string[],
  workingDirectory: string
): Promise<SpawnedGame> {
  const argPart = args.length > 0 ? `-ArgumentList @(${args.map(psLiteral).join(', ')})` : ''
  const script = `(Start-Process -FilePath ${psLiteral(executablePath)} -WorkingDirectory ${psLiteral(workingDirectory)} ${argPart} -Verb RunAs -PassThru).Id`

  try {
    const output = await runPowerShell(script, 180_000)
    const pid = Number.parseInt(output.split(/\r?\n/).pop() ?? '', 10)
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error('Game process could not be verified after UAC prompt.')
    }
    return { pid }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('denied')) {
      throw new Error('This game requires administrator permissions, but the Windows UAC prompt was declined.')
    }
    throw new Error(`Administrator launch failed: ${msg}`)
  }
}

export async function spawnGame(
  executablePath: string,
  args: string[],
  workingDirectory: string,
  runAsAdmin: boolean
): Promise<SpawnedGame> {
  const stat = await fs.stat(executablePath)
  if (!stat.isFile()) throw new Error('The game executable could not be found.')

  if (runAsAdmin) {
    return spawnElevated(executablePath, args, workingDirectory)
  }

  const extension = path.extname(executablePath).toLowerCase()
  const isScript = extension === '.bat' || extension === '.cmd'
  const command = isScript ? 'cmd.exe' : executablePath
  const scriptArguments = args.map(quoteForCmd).join(' ')
  const commandArgs = isScript
    ? ['/d', '/s', '/c', `""${executablePath}"${scriptArguments ? ` ${scriptArguments}` : ''}"`]
    : args

  try {
    return await new Promise<SpawnedGame>((resolve, reject) => {
      let settled = false
      const child = spawn(command, commandArgs, {
        cwd: workingDirectory,
        env: process.env,
        windowsHide: false,
        detached: true,
        stdio: 'ignore'
      })

      child.once('spawn', () => {
        settled = true
        if (!child.pid) {
          reject(new Error('Windows did not return a game process.'))
          return
        }
        child.unref()
        resolve({ pid: child.pid })
      })

      child.once('error', (error) => {
        if (settled) return
        settled = true
        reject(error)
      })
    })
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string }
    // On Windows, EACCES means ERROR_ELEVATION_REQUIRED (740) or permission barrier.
    // Fall back automatically to elevated launch so the user gets the UAC prompt seamlessly!
    if (err?.code === 'EACCES' || err?.message?.includes('EACCES')) {
      return spawnElevated(executablePath, args, workingDirectory)
    }
    throw new Error(`Windows could not start this game: ${err?.message || String(error)}`)
  }
}

function quoteForCmd(value: string): string {
  if (!/[\s"&|<>^]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

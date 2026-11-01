import koffi from 'koffi'

export interface ProcessInfo {
  pid: number
  parentPid: number
  name: string
}

const TH32CS_SNAPPROCESS = 0x00000002
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const MAX_PATH_LONG = 32_768

const kernel32 = koffi.load('kernel32.dll')

const PROCESSENTRY32W = koffi.struct('PROCESSENTRY32W', {
  dwSize: 'uint32',
  cntUsage: 'uint32',
  th32ProcessID: 'uint32',
  th32DefaultHeapID: 'uintptr_t',
  th32ModuleID: 'uint32',
  cntThreads: 'uint32',
  th32ParentProcessID: 'uint32',
  pcPriClassBase: 'int32',
  dwFlags: 'uint32',
  szExeFile: koffi.array('uint16', 260)
})

const CreateToolhelp32Snapshot = kernel32.func(
  'void *CreateToolhelp32Snapshot(uint32 dwFlags, uint32 th32ProcessID)'
)
const Process32FirstW = kernel32.func(
  'bool Process32FirstW(void *hSnapshot, _Inout_ PROCESSENTRY32W *lppe)'
)
const Process32NextW = kernel32.func(
  'bool Process32NextW(void *hSnapshot, _Inout_ PROCESSENTRY32W *lppe)'
)
const CloseHandle = kernel32.func('bool CloseHandle(void *hObject)')
const OpenProcess = kernel32.func(
  'void *OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'
)
const QueryFullProcessImageNameW = kernel32.func(
  'bool QueryFullProcessImageNameW(void *hProcess, uint32 dwFlags, _Out_ uint16 *lpExeName, _Inout_ uint32 *lpdwSize)'
)

function decodeUtf16(values: ArrayLike<number>): string {
  let result = ''
  for (let index = 0; index < values.length; index += 1) {
    const codeUnit = values[index]
    if (codeUnit === 0) break
    result += String.fromCharCode(codeUnit)
  }
  return result
}

let lastSnapshot: { at: number; processes: ProcessInfo[] } | null = null

export function listProcesses(force = false): ProcessInfo[] {
  const now = Date.now()
  if (!force && lastSnapshot && now - lastSnapshot.at < 900) {
    return lastSnapshot.processes
  }

  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
  if (!snapshot) return []

  const processes: ProcessInfo[] = []
  const entry: Record<string, unknown> = {
    dwSize: koffi.sizeof(PROCESSENTRY32W)
  }

  try {
    if (Process32FirstW(snapshot, entry)) {
      do {
        processes.push({
          pid: Number(entry.th32ProcessID),
          parentPid: Number(entry.th32ParentProcessID),
          name: decodeUtf16(entry.szExeFile as ArrayLike<number>)
        })
        entry.dwSize = koffi.sizeof(PROCESSENTRY32W)
      } while (Process32NextW(snapshot, entry))
    }
  } finally {
    CloseHandle(snapshot)
  }

  lastSnapshot = { at: now, processes }
  return processes
}

export function getProcessImagePath(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!handle) return null
  try {
    const buffer = new Uint16Array(MAX_PATH_LONG)
    const length = new Uint32Array([MAX_PATH_LONG])
    const ok = QueryFullProcessImageNameW(handle, 0, buffer, length)
    if (!ok || length[0] === 0) return null
    return decodeUtf16(buffer.subarray(0, length[0]))
  } catch {
    return null
  } finally {
    CloseHandle(handle)
  }
}

export function processNameMatches(name: string, watchName: string): boolean {
  if (!name || !watchName) return false
  return name.toLowerCase() === watchName.toLowerCase()
}

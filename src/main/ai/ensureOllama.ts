import { posix, win32 } from 'node:path'

export type EnsureOllama = {
  readonly platform: NodeJS.Platform
  readonly env: NodeJS.ProcessEnv
  readonly exists: (path: string) => boolean
  /** Fire and forget: the studio must not keep a handle it could kill. */
  readonly spawn: (command: string, args: readonly string[]) => void
  readonly ping: () => Promise<boolean>
  readonly wait?: (ms: number) => Promise<void>
  readonly now?: () => number
  /** Where a studio-installed copy lives, if one does. Searched after the usual locations. */
  readonly extraDir?: string
}

const SETTLE_MS = 200
const SETTLE_TRIES = 25
const SPAWN_COOLDOWN_MS = 30_000

function pathOf(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix
}

function pathEntries(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  const raw = platform === 'win32' ? (env.Path ?? env.PATH ?? '') : (env.PATH ?? '')
  return raw.split(pathOf(platform).delimiter).filter(part => part !== '')
}

function kept(paths: readonly (string | undefined)[]): string[] {
  return paths.filter((path): path is string => path !== undefined && path !== '')
}

function windowsPaths(env: NodeJS.ProcessEnv, exe: string, join: typeof posix.join): string[] {
  return kept([
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs', 'Ollama', exe) : undefined,
    env.ProgramFiles ? join(env.ProgramFiles, 'Ollama', exe) : undefined,
    env['ProgramFiles(x86)'] ? join(env['ProgramFiles(x86)'], 'Ollama', exe) : undefined,
  ])
}

function unixPaths(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, exe: string): string[] {
  if (platform === 'darwin') {
    return [
      '/opt/homebrew/bin/ollama',
      '/usr/local/bin/ollama',
      '/Applications/Ollama.app/Contents/Resources/ollama',
    ]
  }
  const home = env.HOME ?? env.USERPROFILE ?? ''
  return kept([
    '/usr/local/bin/ollama',
    '/usr/bin/ollama',
    '/snap/bin/ollama',
    home ? posix.join(home, '.local', 'bin', exe) : undefined,
  ])
}

/**
 * Usual install locations, then an optional studio copy, then PATH. Joins follow the handed-in
 * platform, not this process's — a Windows path asserted on a Mac would otherwise go through posix.
 */
export function ollamaBinary(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  extraDir?: string,
): string[] {
  const { join } = pathOf(platform)
  const exe = platform === 'win32' ? 'ollama.exe' : 'ollama'
  const known = platform === 'win32' ? windowsPaths(env, exe, join) : unixPaths(platform, env, exe)

  return [
    ...known,
    ...(extraDir ? [join(extraDir, exe), join(extraDir, 'bin', exe)] : []),
    ...pathEntries(platform, env).map(dir => join(dir, exe)),
  ]
}

export function ollamaInstalled(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean,
  extraDir?: string,
): boolean {
  return ollamaBinary(platform, env, extraDir).some(exists)
}

/**
 * Starts the local chat service if it is already installed and not answering.
 * Never stops it, never uninstalls it: a handle would be a way to kill it.
 */
export function ensureOllama(deps: EnsureOllama): () => Promise<boolean> {
  let inflight: Promise<boolean> | null = null
  let lastSpawnAt: number | null = null

  function now(): number {
    return deps.now?.() ?? Date.now()
  }

  function wait(ms: number): Promise<void> {
    return deps.wait?.(ms) ?? new Promise<void>(resolve => setTimeout(resolve, ms))
  }

  async function settle(): Promise<boolean> {
    for (let tries = 0; tries < SETTLE_TRIES; tries += 1) {
      if (await deps.ping()) return true
      await wait(SETTLE_MS)
    }
    return deps.ping()
  }

  async function run(): Promise<boolean> {
    if (await deps.ping()) return true

    const binary = ollamaBinary(deps.platform, deps.env, deps.extraDir).find(deps.exists)
    if (binary === undefined) return false
    if (lastSpawnAt !== null && now() - lastSpawnAt < SPAWN_COOLDOWN_MS) return false

    lastSpawnAt = now()
    deps.spawn(binary, ['serve'])
    return settle()
  }

  return () => {
    if (inflight) return inflight
    inflight = run().finally(() => {
      inflight = null
    })
    return inflight
  }
}

import { join } from 'node:path'

/** How a checkout asks for the machine: `whole` waits its turn, `narrow` never waits. */
type Lane = 'whole' | 'narrow'

/** The mutex a whole suite holds, shared by every checkout: the cores are the machine's. */
export function lockPathIn(tmpdir: string): string {
  return join(tmpdir, 'ia-studio-vitest.lock')
}

/** One file per live run, named by its pid. Counting them is how the cores get divided. */
export function slotsDirIn(tmpdir: string): string {
  return join(tmpdir, 'ia-studio-vitest-slots')
}

/**
 * The pid a holder wrote, or nothing while the file has none — creating the file and writing it
 * are two calls, and a reader landing between them must wait rather than declare the lock stale.
 */
export function holderOf(contents: string): number | undefined {
  const pid = Number(contents.trim())
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined
}

/**
 * Whether a pid still exists. `ESRCH` alone means gone: `EPERM` says it runs under another user,
 * which is running all the same, and any other errno is an answer nobody has — treating those as
 * dead would let a run steal a lock it cannot see.
 */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (failure) {
    return (failure as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/**
 * The cores one run may take when `runs` of them share the machine.
 *
 * Measured 2026-09-08: three checkouts each asked vitest for its default `cpus - 1` — 33 workers
 * on twelve cores, load average 90, and a suite worth 150 s alone took 338 s. Alone the answer is
 * that same default, so nothing is paid for a contention that is not there.
 *
 * 🛑 Counted over EVERY run, not over whole suites: `pnpm check` spawns its two selections side by
 * side on purpose, so one checkout in its short loop is already two runs.
 */
export function workersFor(cores: number, runs: number): number {
  return Math.max(1, Math.floor(Math.max(1, cores - 1) / Math.max(1, runs)))
}

/**
 * A path rather than a flag or a subcommand. Read this way, and not as "the argument after `run`":
 * `--project node` puts a bare word there that names no file.
 */
const namesAFile = (argument: string): boolean =>
  !argument.startsWith('-') && (argument.includes('/') || /\.tsx?$/.test(argument))

/**
 * A run that names files is a selection whatever the caller asked for — `pnpm test <path>` is what
 * the protocol says to rerun a failed link with, and it must not queue behind a whole suite. The
 * wrapper is the only place that sees that path, so the lane is read here rather than declared.
 */
export function laneOf(asked: Lane, forwarded: readonly string[]): Lane {
  return asked === 'whole' && !forwarded.some(namesAFile) ? 'whole' : 'narrow'
}

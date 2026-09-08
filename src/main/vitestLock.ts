import { join } from 'node:path'

/** How a checkout asks for the machine: `whole` waits its turn, `narrow` never waits. */
type Lane = 'whole' | 'narrow'

/**
 * What a selection may take while a whole suite holds the machine. Measured 2026-09-08: three
 * checkouts each asked vitest for `cpus - 1` — 33 workers on twelve cores, load average 90, and a
 * suite worth 150 s alone took 338 s. Four bounds the overshoot instead of tripling the machine.
 */
export const NARROW_WORKERS = 4

/** One path per user, shared by every checkout: the cores they compete for are the machine's. */
export function lockPathIn(tmpdir: string): string {
  return join(tmpdir, 'ia-studio-vitest.lock')
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
 * A path rather than a flag or a subcommand. Read this way, and not as "the argument after `run`":
 * `--project node` puts a bare word there that names no file.
 */
const namesAFile = (argument: string): boolean =>
  !argument.startsWith('-') && (argument.includes('/') || /\.tsx?$/.test(argument))

/**
 * A run that names files is a selection whatever the caller asked for — `pnpm test <path>` is what
 * reruns a failed gate link, and it must not queue behind another checkout's whole suite.
 */
export function laneOf(asked: Lane, forwarded: readonly string[]): Lane {
  return asked === 'whole' && !forwarded.some(namesAFile) ? 'whole' : 'narrow'
}

/**
 * A selection is capped only while another checkout holds the machine. Capping it always would
 * pay for a contention that is not there: the short loop is 8 s on an idle machine, and its wide
 * guards are 140 files that want every core.
 */
export function workerArgsFor(lane: Lane, machineHeld: boolean): string[] {
  return lane === 'narrow' && machineHeld ? [`--maxWorkers=${NARROW_WORKERS}`] : []
}

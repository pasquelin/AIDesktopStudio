/**
 * Every vitest run of this repository goes through here, so that several runs of one machine share
 * its cores instead of each asking for all of them.
 *
 * Measured 2026-09-08, twelve cores: three sessions running their suite at once asked for 33
 * workers, load average 90, and `pnpm test` took 338 s against the 150 s it costs alone.
 *
 * Two mechanisms, and the second is the general one. Every run holds a SLOT — a pid file in a
 * folder shared by every checkout — and takes `cpus / slots` workers, so a lone run keeps vitest's
 * own width and three runs divide the machine instead of tripling it. On top of that a whole suite
 * takes a MUTEX and runs in its turn: three suites cost three suites either way, but queued, the
 * first session gets its answer in 150 s rather than all three waiting 450 s.
 *
 * 🛑 Slots count EVERY run, not whole suites: `pnpm check` spawns its two selections side by side
 * on purpose, so one checkout in its short loop is already two runs.
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  holderIn,
  holderOf,
  isRunning,
  lockPathIn,
  slotsDirIn,
  waitsForTheMachine,
  workersFor,
} from '../src/main/vitestLock.ts'
import { timedRun } from './timedRun.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = lockPathIn(tmpdir())
const SLOTS = slotsDirIn(tmpdir())
const MINE = join(SLOTS, String(process.pid))
const POLL_MS = 500
/** A holder that never releases must not keep the machine for a night. */
const MOST_WAIT_MS = 30 * 60_000

const forwarded = process.argv.slice(2)

function take() {
  try {
    const fd = openSync(LOCK, 'wx')
    writeSync(fd, String(process.pid))
    closeSync(fd)
    return true
  } catch (failure) {
    if (failure.code !== 'EEXIST') throw failure
    return false
  }
}

/** A holder killed outright leaves its file behind, and nothing else would ever clear it. */
function clearIfDead() {
  const holder = holderIn(LOCK)
  if (holder !== undefined && !isRunning(holder)) rmSync(LOCK, { force: true })
}

function release() {
  rmSync(MINE, { force: true })
  if (holderIn(LOCK) === process.pid) rmSync(LOCK, { force: true })
}

async function hold() {
  const until = Date.now() + MOST_WAIT_MS
  let rounds = 0

  while (!take()) {
    clearIfDead()
    if (Date.now() > until) {
      process.stderr.write('vitest lock: waited 30 min for the machine, running anyway.\n')
      return
    }
    rounds += 1
    // On the second round, not the first: a lock left behind by a killed holder is cleared just
    // above and taken on the next round, and announcing that as a wait would be a lie.
    if (rounds === 2) {
      process.stdout.write('Another checkout is running its suite; waiting for the machine.\n')
    }
    await pause(POLL_MS)
  }
}

/** How many runs share the machine right now, this one included. */
export function liveRuns() {
  if (!existsSync(SLOTS)) return 0

  let live = 0
  for (const name of readdirSync(SLOTS)) {
    // Through `holderOf` rather than `Number`: a name that is not a pid makes `process.kill` throw
    // ERR_INVALID_ARG_TYPE, which `isRunning` reads as alive — one phantom run, for ever.
    const pid = holderOf(name)
    if (pid !== undefined && isRunning(pid)) live += 1
    else rmSync(join(SLOTS, name), { force: true, recursive: true })
  }
  return live
}

let running

process.on('exit', release)
for (const signal of ['SIGINT', 'SIGTERM']) {
  // The child first, and `exit` releases: killed from a parent rather than from a terminal, vitest
  // keeps every worker while the lock and the slot are given back, and the next run divides a
  // machine still busy.
  process.on(signal, () => {
    running?.kill(signal)
    process.exit(1)
  })
}

if (waitsForTheMachine(forwarded)) await hold()

// Claimed after the wait, so a queued suite counts the machine it is about to get, not the one it
// waited on.
mkdirSync(SLOTS, { recursive: true })
writeFileSync(MINE, String(process.pid))

const workers = workersFor(availableParallelism(), liveRuns())
// The local binary rather than `npx`: measured 2026-09-08, `npx vitest --version` costs 733 ms
// against 82 ms, paid twice on every short loop.
const { child, finished } = timedRun(
  [join(ROOT, 'node_modules', '.bin', 'vitest'), ...forwarded, `--maxWorkers=${workers}`],
  ROOT,
)
running = child
process.exitCode = (await finished).code ?? 1

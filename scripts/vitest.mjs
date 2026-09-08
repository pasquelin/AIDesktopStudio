/**
 * Every vitest run of this repository goes through here, so that several checkouts of one machine
 * share its cores instead of each asking for all of them.
 *
 * Measured 2026-09-08, twelve cores: three sessions running their suite at once asked for 33
 * workers, load average 90, and `pnpm test` took 338 s against the 150 s it costs alone. A whole
 * suite now waits its turn and then runs at full width; a selection never waits and is capped, so
 * `pnpm check` stays the short loop.
 *
 * What this does NOT do, and it is the honest half: the work is unchanged. Three suites still cost
 * three suites. What it removes is the thrash of running them on top of one another, and it makes
 * a timing mean something again.
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
// A `.ts` from a `.mjs`, as `check.mjs` does: Node 24 strips the types on the way in, so the rule
// the tests check is the one that runs rather than a twin of it.
import { holderOf, laneOf, lockPathIn, workerArgsFor } from '../src/main/vitestLock.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCK = lockPathIn(tmpdir())
const POLL_MS = 500
/** A holder that never releases must not keep the machine for a night. */
const MOST_WAIT_MS = 30 * 60_000

const [asked, ...forwarded] = process.argv.slice(2)

if (asked !== 'whole' && asked !== 'narrow') {
  process.stderr.write('\nusage: node scripts/vitest.mjs <whole|narrow> <vitest arguments>\n\n')
  process.exit(1)
}

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
  if (!existsSync(LOCK)) return

  let holder
  try {
    holder = holderOf(readFileSync(LOCK, 'utf8'))
  } catch (failure) {
    // Read between another run's create and its write, or removed under us. Waiting one more
    // round is what a holder mid-take deserves, and the timeout below covers a file that stays.
    process.stderr.write(`vitest lock: unreadable, left alone — ${failure.message}\n`)
    return
  }
  if (holder === undefined) return

  try {
    process.kill(holder, 0)
  } catch (failure) {
    // ESRCH alone. EPERM says the holder runs under another user, which is a holder all the same.
    if (failure.code === 'ESRCH') rmSync(LOCK, { force: true })
  }
}

function release() {
  if (!existsSync(LOCK)) return
  try {
    if (holderOf(readFileSync(LOCK, 'utf8')) === process.pid) rmSync(LOCK, { force: true })
  } catch (failure) {
    process.stderr.write(`vitest lock: could not be released — ${failure.message}\n`)
  }
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

process.on('exit', release)
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    release()
    process.exit(1)
  })
}

/** Whether another run holds the machine right now — read once, just before spawning. */
function machineHeld() {
  clearIfDead()
  return existsSync(LOCK)
}

const lane = laneOf(asked, forwarded)

if (lane === 'whole') await hold()

const child = spawn('npx', ['vitest', ...forwarded, ...workerArgsFor(lane, machineHeld())], {
  cwd: ROOT,
  stdio: 'inherit',
})
child.on('error', failure => {
  process.stderr.write(`${failure.message}\n`)
  process.exitCode = 1
})
child.on('close', code => {
  process.exitCode = code ?? 1
})

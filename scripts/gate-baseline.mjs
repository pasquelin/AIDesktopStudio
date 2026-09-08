/**
 * What the gate costs on THIS machine, link by link, and how far that has drifted since the last
 * time it was asked.
 *
 * Why a script rather than a stopwatch: every timing quoted about this gate before 2026-09-08 was
 * taken while other checkouts were running their own suites, and each was wrong by a factor of two.
 * A measurement nobody can replay is an anecdote. This one refuses to run on a busy machine, and
 * keeps the previous relevé beside the new one so a slowdown is seen rather than remembered.
 *
 * The relevé lives under `node_modules/`, never committed: a baseline belongs to the machine that
 * took it, and carrying one checkout's numbers into another clone is how the 39 s in `rule-tests`
 * outlived the suite it described.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism, loadavg, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CACHE_DIR } from '../src/main/gateCache.ts'
import { GATE } from '../src/main/gateLinks.ts'
import { holderOf, lockPathIn } from '../src/main/vitestLock.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RELEVE = join(ROOT, CACHE_DIR, 'baseline.json')

/** Half the cores already busy is not this machine at rest, and a timing taken there says nothing. */
const BUSY_ENOUGH = availableParallelism() / 2

function whyBusy() {
  const lock = lockPathIn(tmpdir())
  if (existsSync(lock)) {
    const holder = holderOf(readFileSync(lock, 'utf8'))
    if (holder !== undefined && alive(holder))
      return `another checkout is running its suite (${holder})`
  }
  const [load] = loadavg()
  if (load > BUSY_ENOUGH)
    return `load average is ${load.toFixed(1)}, over the ${BUSY_ENOUGH} this machine may carry`
  return undefined
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (failure) {
    // EPERM says it runs under another user, which is running all the same.
    return failure.code === 'EPERM'
  }
}

function timeLink(command) {
  const started = Date.now()
  const [binary, ...args] = command.split(' ')
  return new Promise(resolve => {
    const child = spawn(binary, args, { cwd: ROOT, stdio: 'inherit' })
    const done = code => resolve({ code, seconds: (Date.now() - started) / 1000 })
    child.on('error', () => done(1))
    child.on('close', done)
  })
}

const previous = existsSync(RELEVE) ? JSON.parse(readFileSync(RELEVE, 'utf8')) : undefined

const busy = whyBusy()
if (busy !== undefined) {
  process.stderr.write(`\nRefusing to measure: ${busy}.\nWait for the machine, then ask again.\n\n`)
  process.exit(1)
}

const links = []
for (const { command } of GATE) {
  const { code, seconds } = await timeLink(command)
  links.push({ command, seconds, green: code === 0 })
  if (code !== 0) break
}

const taken = { at: new Date().toISOString(), cores: availableParallelism(), links }
mkdirSync(dirname(RELEVE), { recursive: true })
writeFileSync(RELEVE, `${JSON.stringify(taken, undefined, 2)}\n`)

const before = new Map(previous?.links.map(one => [one.command, one.seconds]) ?? [])
process.stdout.write(`\n  ${'link'.padEnd(34)} ${'now'.padStart(8)} ${'before'.padStart(9)}\n`)
for (const { command, seconds, green } of links) {
  const was = before.get(command)
  const drift = was === undefined ? '—' : `${was.toFixed(1)} s`
  process.stdout.write(
    `  ${green ? ' ' : '✗'} ${command.padEnd(32)} ${`${seconds.toFixed(1)} s`.padStart(8)} ${drift.padStart(9)}\n`,
  )
}
const total = links.reduce((sum, one) => sum + one.seconds, 0)
const was = previous?.links.reduce((sum, one) => sum + one.seconds, 0)
process.stdout.write(
  `\n  The gate costs ${total.toFixed(0)} s on ${availableParallelism()} cores` +
    `${was === undefined ? '' : `, against ${was.toFixed(0)} s on ${previous.at.slice(0, 10)}`}.\n\n`,
)
if (links.some(one => !one.green)) process.exitCode = 1

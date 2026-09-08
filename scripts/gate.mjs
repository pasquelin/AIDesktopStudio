/**
 * `pnpm validate`: the links of the gate, run in order, each skipped when nothing it reads has
 * moved since it was last green. `--baseline` measures instead, refusing a busy machine.
 *
 * Why a cache at all: measured 2026-09-08, the gate costs 334 s cold and 2 s when every verdict
 * still holds, and an agent that reruns it out of caution pays the difference for a tree that has
 * not changed by one byte. Turborepo was weighed and set aside — this is one package, so its task
 * graph buys nothing and only its hashing was wanted.
 *
 * 🛑 What keeps this honest: the markers live under `node_modules/`, which no clone carries, so
 * **CI always runs the whole gate**. A green pull request is a green FULL gate, whatever this
 * script decided on somebody's desk. `--fresh` does the same locally.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, loadavg, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  alreadyGreen,
  BASELINE_NAME,
  CACHE_DIR,
  fingerprinterFor,
  markerNameOf,
  markerPathIn,
} from '../src/main/gateCache.ts'
import { GATE } from '../src/main/gateLinks.ts'
import { holderIn, isRunning, lockPathIn } from '../src/main/vitestLock.ts'
import { timedRun } from './timedRun.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKERS = join(ROOT, CACHE_DIR)
const RELEVE = join(MARKERS, BASELINE_NAME)

/**
 * A baseline is a cold run or it is nothing, so it forces `--fresh`. It is not a second script:
 * one that ran the whole chain and wrote no marker paid 334 s twice — once to learn a number, once
 * for the `pnpm validate` that followed.
 */
const MEASURING = process.argv.includes('--baseline')
const FRESH = MEASURING || process.argv.includes('--fresh') || process.env.GATE_FRESH === '1'

/** Half the cores already busy is not this machine at rest, and a timing taken there says nothing. */
function whyBusy() {
  const holder = holderIn(lockPathIn(tmpdir()))
  if (holder !== undefined && isRunning(holder)) {
    return `another checkout is running its suite (${holder})`
  }

  const [load] = loadavg()
  const carried = availableParallelism() / 2
  return load > carried
    ? `load average is ${load.toFixed(1)}, over the ${carried} this machine may carry`
    : undefined
}

if (MEASURING) {
  const busy = whyBusy()
  if (busy !== undefined) {
    process.stderr.write(
      `\nRefusing to measure: ${busy}.\nWait for the machine, then ask again.\n\n`,
    )
    process.exit(1)
  }
}

mkdirSync(MARKERS, { recursive: true })

/** A renamed link leaves its marker behind, and a stale one only misleads whoever reads the folder. */
function sweepOrphans() {
  const wanted = new Set(GATE.map(link => markerNameOf(link.command)))
  for (const name of readdirSync(MARKERS)) {
    // `recursive`: `force` only swallows ENOENT, and a directory here would throw EISDIR before
    // the first link ran.
    if (!wanted.has(name) && name !== BASELINE_NAME) {
      rmSync(join(MARKERS, name), { force: true, recursive: true })
    }
  }
}

sweepOrphans()

const previous =
  MEASURING && existsSync(RELEVE) ? JSON.parse(readFileSync(RELEVE, 'utf8')) : undefined
const fingerprintOf = fingerprinterFor(ROOT, process.version, GATE)
const report = []

for (const link of GATE) {
  const fingerprint = fingerprintOf(link)

  if (!FRESH && alreadyGreen(ROOT, link, fingerprint)) {
    report.push({ command: link.command })
    continue
  }

  // Removed BEFORE the run, not after a red one: killed mid-link, the gate must not keep a marker
  // that says the link passed.
  rmSync(markerPathIn(ROOT, link.command), { force: true })
  const { code, seconds } = await timedRun(link.command.split(' '), ROOT).finished
  report.push({ command: link.command, seconds })

  if (code !== 0) {
    process.stdout.write(`\n✗ ${link.command} — the gate stops here.\n\n`)
    process.exitCode = code ?? 1
    break
  }
  writeFileSync(markerPathIn(ROOT, link.command), fingerprint)
}

const before = new Map(previous?.links.map(one => [one.command, one.seconds]) ?? [])
process.stdout.write('\n')
for (const { command, seconds } of report) {
  const cost = seconds === undefined ? 'cached' : `${seconds.toFixed(1)} s`
  const was = before.get(command)
  const drift = MEASURING ? ` ${(was === undefined ? '—' : `${was.toFixed(1)} s`).padStart(9)}` : ''
  process.stdout.write(`  ✓ ${command.padEnd(34)} ${cost.padStart(8)}${drift}\n`)
}

// Only a whole green run: a chain stopped on a red link measures a prefix, and writing it would
// make the next baseline compare against a total that was never the gate.
if (MEASURING && process.exitCode === undefined) {
  writeFileSync(
    RELEVE,
    `${JSON.stringify({ at: new Date().toISOString(), cores: availableParallelism(), links: report }, undefined, 2)}\n`,
  )
}
if (process.exitCode === undefined) {
  const spent = report.reduce((total, one) => total + (one.seconds ?? 0), 0)
  const skipped = report.filter(one => one.seconds === undefined).length
  const was = previous?.links.reduce((total, one) => total + (one.seconds ?? 0), 0)
  process.stdout.write(
    `\nThe gate is green in ${spent.toFixed(0)} s, ${skipped} of ${GATE.length} links cached` +
      `${was === undefined ? '' : `, against ${was.toFixed(0)} s on ${previous.at.slice(0, 10)}`}.\n` +
      'CI runs every link regardless; `pnpm validate --fresh` does the same here.\n\n',
  )
}

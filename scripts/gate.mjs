/**
 * `pnpm validate`: the links of the gate, run in order, each skipped when nothing it reads has
 * moved since it was last green.
 *
 * Why a cache at all: measured 2026-09-08, the gate costs 338 s cold and 4 s when every verdict
 * still holds, and an agent that reruns it out of caution pays the difference for a tree that has
 * not changed by one byte. Turborepo was weighed and set aside — this is one package, so its task
 * graph buys nothing and only its hashing was wanted.
 *
 * 🛑 What keeps this honest: the markers live under `node_modules/`, which no clone carries, so
 * **CI always runs the whole gate**. A green pull request is a green FULL gate, whatever this
 * script decided on somebody's desk. `--fresh` does the same locally.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  alreadyGreen,
  CACHE_DIR,
  fingerprinterFor,
  markerNameOf,
  markerPathIn,
} from '../src/main/gateCache.ts'
import { GATE } from '../src/main/gateLinks.ts'
import { timedLink } from './timedLink.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKERS = join(ROOT, CACHE_DIR)
const FRESH = process.argv.includes('--fresh') || process.env.GATE_FRESH === '1'

mkdirSync(MARKERS, { recursive: true })

/** A renamed link leaves its marker behind, and a stale one only misleads whoever reads the folder. */
function sweepOrphans() {
  const wanted = new Set(GATE.map(link => markerNameOf(link.command)))
  for (const name of readdirSync(MARKERS)) {
    if (!wanted.has(name) && name !== 'baseline.json') rmSync(join(MARKERS, name), { force: true })
  }
}

sweepOrphans()

const fingerprintOf = fingerprinterFor(ROOT, process.version, GATE)
const report = []

for (const link of GATE) {
  const fingerprint = fingerprintOf(link)

  if (!FRESH && alreadyGreen(ROOT, link, fingerprint)) {
    report.push({ command: link.command, cached: true })
    continue
  }

  // Removed BEFORE the run, not after a red one: killed mid-link, the gate must not keep a marker
  // that says the link passed.
  rmSync(markerPathIn(ROOT, link.command), { force: true })
  const { code, seconds } = await timedLink(link.command, ROOT)

  if (code !== 0) {
    process.stdout.write(`\n✗ ${link.command} — the gate stops here.\n\n`)
    process.exitCode = code ?? 1
    break
  }

  writeFileSync(markerPathIn(ROOT, link.command), fingerprint)
  report.push({ command: link.command, seconds })
}

process.stdout.write('\n')
for (const { command, seconds, cached } of report) {
  const cost = cached === true ? 'cached' : `${seconds.toFixed(1)} s`
  process.stdout.write(`  ✓ ${command.padEnd(34)} ${cost.padStart(8)}\n`)
}
if (process.exitCode === undefined) {
  const spent = report.reduce((total, one) => total + (one.seconds ?? 0), 0)
  const skipped = report.filter(one => one.cached === true).length
  process.stdout.write(
    `\nThe gate is green in ${spent.toFixed(0)} s, ${skipped} of ${GATE.length} links cached.\n` +
      'CI runs every link regardless; `pnpm validate --fresh` does the same here.\n\n',
  )
}

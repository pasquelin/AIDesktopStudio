/**
 * `pnpm validate`: the links of the gate, run in order, each skipped when nothing it reads has
 * moved since it was last green.
 *
 * Why a cache at all: measured 2026-09-08, the gate costs minutes, and an agent that reruns it out
 * of caution pays them again for a tree that has not changed by one byte. Turborepo was weighed and
 * set aside — this is one package, so its task graph buys nothing and only its hashing was wanted.
 *
 * 🛑 What keeps this honest: the markers live under `node_modules/`, which no clone carries, so
 * **CI always runs the whole gate**. A green pull request is a green FULL gate, whatever this
 * script decided on somebody's desk. `--fresh` does the same locally.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// A `.ts` from a `.mjs`, as `check.mjs` does: Node 24 strips the types on the way in, so the rule
// the tests check is the one that runs rather than a twin of it.
import { CACHE_DIR, fingerprinterFor, markerNameOf } from '../src/main/gateCache.ts'
import { GATE } from '../src/main/gateLinks.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARKERS = join(ROOT, CACHE_DIR)
const FRESH = process.argv.includes('--fresh') || process.env.GATE_FRESH === '1'

function runLink(command) {
  const started = Date.now()
  // Split on spaces: every link is a bare command with bare arguments, and one needing a quoted
  // argument would have to say so here rather than hide it in a string.
  const [binary, ...args] = command.split(' ')
  return new Promise(resolve => {
    const child = spawn(binary, args, { cwd: ROOT, stdio: 'inherit' })
    const done = code => resolve({ code, seconds: (Date.now() - started) / 1000 })
    child.on('error', failure => {
      process.stderr.write(`${failure.message}\n`)
      done(1)
    })
    child.on('close', done)
  })
}

const marker = link => join(MARKERS, markerNameOf(link.command))

/** A link is green-and-unchanged only if its own output is still on disk. */
function alreadyGreen(link, fingerprint) {
  if (FRESH || !existsSync(marker(link))) return false
  if (link.produces !== undefined && !existsSync(join(ROOT, link.produces))) return false
  return readFileSync(marker(link), 'utf8').trim() === fingerprint
}

mkdirSync(MARKERS, { recursive: true })

const fingerprintOf = fingerprinterFor(ROOT, process.version)
const report = []

for (const link of GATE) {
  const fingerprint = fingerprintOf(link)

  if (alreadyGreen(link, fingerprint)) {
    report.push({ command: link.command, seconds: 0, cached: true })
    continue
  }

  // Removed BEFORE the run, not after a red one: killed mid-link, the gate must not keep a marker
  // that says the link passed.
  rmSync(marker(link), { force: true })
  const { code, seconds } = await runLink(link.command)

  if (code !== 0) {
    process.stdout.write(`\n✗ ${link.command} — the gate stops here.\n\n`)
    process.exitCode = code ?? 1
    break
  }

  writeFileSync(marker(link), fingerprint)
  report.push({ command: link.command, seconds, cached: false })
}

process.stdout.write('\n')
for (const { command, seconds, cached } of report) {
  const cost = cached ? 'cached' : `${seconds.toFixed(1)} s`
  process.stdout.write(`  ✓ ${command.padEnd(34)} ${cost.padStart(8)}\n`)
}
if (process.exitCode === undefined) {
  const spent = report.reduce((total, one) => total + one.seconds, 0)
  const skipped = report.filter(one => one.cached).length
  process.stdout.write(
    `\nThe gate is green in ${spent.toFixed(0)} s, ${skipped} of ${GATE.length} links cached.\n` +
      'CI runs every link regardless; `pnpm validate --fresh` does the same here.\n\n',
  )
}

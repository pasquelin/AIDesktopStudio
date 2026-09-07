/**
 * Classified duplication report: token clones (jscpd) plus same-shape functions (dry-ts).
 *
 * A report, not a gate — the same split as `pnpm duplication`. Stratification across ipc / main /
 * renderer, the two i18n indexes, and two SQLite drivers are expected and stay in the listing.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEST = /(\.(test|bench)|-fixtures)\.[cm]?tsx?$/
const isTest = path => TEST.test(path.replaceAll('\\', '/'))

const run = (bin, args) => {
  const result = spawnSync(bin, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${bin} exited ${result.status}\n`)
    process.exit(result.status ?? 1)
  }
  return result
}

const tmp = mkdtempSync(join(tmpdir(), 'duplication-'))
try {
  run('jscpd', ['--reporters', 'json', '--output', tmp, '--silent', '--no-tips', 'src'])
  const jscpd = JSON.parse(readFileSync(join(tmp, 'jscpd-report.json'), 'utf8'))
  const dry = JSON.parse(run('dry-ts', ['--profile', 'src', '--format', 'json', 'src']).stdout)

  const clones = jscpd.duplicates ?? []
  const buckets = { 'prod-prod': [], mixed: [], 'test-test': [] }
  for (const clone of clones) {
    const a = isTest(clone.firstFile.name)
    const b = isTest(clone.secondFile.name)
    const key = a && b ? 'test-test' : a || b ? 'mixed' : 'prod-prod'
    buckets[key].push(clone)
  }

  const prodCross = buckets['prod-prod'].filter(c => c.firstFile.name !== c.secondFile.name)
  const clusters = dry.clusters ?? []
  const named = []
  const heavy = []
  for (const cluster of clusters) {
    const locs = cluster.locations ?? []
    const files = new Set(locs.map(l => l.file))
    const names = [...new Set(locs.map(l => l.name).filter(Boolean))]
    const maxNodes = Math.max(0, ...locs.map(l => l.nodes ?? 0))
    const row = {
      min: cluster.score?.min ?? 0,
      names,
      maxNodes,
      locations: locs.map(
        l => `${l.file}:${l.startLine}-${l.endLine} ${l.kind}${l.name ? ` ${l.name}` : ''}`,
      ),
    }
    if (names.length === 1 && files.size > 1) named.push(row)
    else if (files.size > 1 && maxNodes >= 40) heavy.push(row)
  }
  named.sort((a, b) => b.maxNodes - a.maxNodes)
  heavy.sort((a, b) => b.maxNodes - a.maxNodes)

  const loc = c =>
    `${c.firstFile.name}:${c.firstFile.startLoc.line}-${c.firstFile.endLoc.line} ≡ ${c.secondFile.name}:${c.secondFile.startLoc.line}-${c.secondFile.endLoc.line}`

  const lines = [
    `jscpd  ${clones.length} clones · prod-prod ${buckets['prod-prod'].length} (cross-file ${prodCross.length}) · mixed ${buckets.mixed.length} · test-test ${buckets['test-test'].length}`,
    `dry-ts ${clusters.length} clusters · same-name across files ${named.length} · unnamed cross-file ≥40 nodes ${heavy.length}`,
    '',
    '## same-name across files',
    ...named.flatMap(c => [
      `- [${c.min.toFixed(2)} · ${c.maxNodes}n] ${c.names.join(',')}`,
      ...c.locations.map(l => `    ${l}`),
    ]),
    '',
    '## jscpd prod-prod cross-file',
    ...prodCross.map(c => `- ${c.lines}L/${c.tokens}t ${loc(c)}`),
    '',
    '## dry-ts unnamed cross-file ≥40 nodes',
    ...heavy.flatMap(c => [
      `- [${c.min.toFixed(2)} · ${c.maxNodes}n] ${c.names.join('|') || '(anon)'}`,
      ...c.locations.map(l => `    ${l}`),
    ]),
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

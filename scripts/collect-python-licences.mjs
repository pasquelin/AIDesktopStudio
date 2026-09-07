/**
 * Reads the licence of every Python package the engine distributes, into `engine/licences.json`.
 *
 * npm sees none of this and `uv.lock` carries no licence at all — measured 2026-08-22 on a
 * 68-package lock, which is the whole of § F.4 of the engine spec. What DOES carry it is the
 * `dist-info/METADATA` of a materialised environment, so this reads one and writes down what it
 * found; the result is committed, and `collect-licences.mjs` reads the file rather than the disk.
 *
 * Committed rather than read at collect time for one reason: materialising the generation
 * environment costs 682 Mo, and neither the gate nor a clone should have to pay it to produce a
 * notice.
 *
 *     node scripts/collect-python-licences.mjs                    # materialises, then reads
 *     node scripts/collect-python-licences.mjs --python <path>    # reads an existing one
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { embeddedProfiles } from './prepare-engine-runtime.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = join(ROOT, 'engine')
const DESTINATION = join(ENGINE, 'licences.json')

/**
 * The SPDX identifier a `METADATA` file states, by either of the two spellings it may use.
 *
 * `License-Expression` is the modern one; `Classifier: License ::` is what most of this tree
 * still carries, and a handful state neither — `torch` and `numpy` publish an empty field and
 * name their licence only in their repository. Those answer `null` and are named by hand.
 */
function licenceOf(metadata) {
  const expression = /^License-Expression:\s*(.+)$/m.exec(metadata)
  if (expression) return expression[1].trim()

  const declared = /^License:\s*(.+)$/m.exec(metadata)
  if (declared && declared[1].trim() && !declared[1].includes('\n')) {
    const value = declared[1].trim()
    if (value.length < 60) return value
  }

  const classified = [...metadata.matchAll(/^Classifier: License :: (.+)$/gm)]
    .map(match => match[1].split(' :: ').pop().trim())
    .filter(name => name !== 'OSI Approved')

  return classified[0] ?? null
}

/**
 * Where a package's source lives, by either spelling.
 *
 * `Home-page` is the old field and most of this tree no longer writes it — measured, twelve of
 * forty-three had none. Modern packaging states `Project-URL: repository`, and the offer a
 * copyleft licence obliges is read from there or from nowhere: `tqdm` is `MPL-2.0 AND MIT`, and
 * `licences:collect` refuses the build without its source. Repository first, homepage second: an
 * offer must point at the sources, not at a landing page.
 */
function sourceOf(metadata) {
  const urls = [...metadata.matchAll(/^Project-URL:\s*([^,]+),\s*(.+)$/gm)].map(match => [
    match[1].trim().toLowerCase(),
    match[2].trim(),
  ])

  const repository = urls.find(([label]) => /repo|source|code/.test(label))
  const homepage = urls.find(([label]) => /home/.test(label))
  const declared = /^Home-page:\s*(.+)$/m.exec(metadata)?.[1]?.trim()

  return repository?.[1] ?? declared ?? homepage?.[1] ?? null
}

/** What the licences of a tree read, keyed by the name the lock uses. */
function readEnvironment(sitePackages) {
  const found = {}

  for (const entry of readdirSync(sitePackages)) {
    if (!entry.endsWith('.dist-info')) continue

    const metadata = join(sitePackages, entry, 'METADATA')
    if (!existsSync(metadata)) continue

    const text = readFileSync(metadata, 'utf8')
    const name = /^Name:\s*(.+)$/m.exec(text)?.[1]?.trim()
    if (!name || name === 'ai-desktop-studio-engine') continue

    // Normalised the way the lock spells it: PyPI allows `_` and `.` where the lock writes `-`.
    found[name.toLowerCase().replace(/[._]+/g, '-')] = {
      version: /^Version:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null,
      spdx: licenceOf(text),
      home: sourceOf(text),
    }
  }

  return found
}

function sitePackagesOf(python) {
  return execFileSync(python, ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], {
    encoding: 'utf8',
  }).trim()
}

function materialise() {
  const venv = join(ENGINE, '.licences-venv')
  const work = mkdtempSync(join(tmpdir(), 'ai-desktop-studio-licences-'))
  const requirements = join(work, 'requirements.txt')
  console.log('Materialising the embedded local AI runtime profiles.')
  execFileSync('uv', ['venv', '--python', '3.12', venv], { stdio: 'inherit' })
  try {
    execFileSync(
      'uv',
      [
        'export',
        '--project',
        ENGINE,
        '--locked',
        '--quiet',
        '--no-dev',
        ...embeddedProfiles().flatMap(profile => ['--extra', profile]),
        '--no-emit-project',
        '--output-file',
        requirements,
      ],
      { stdio: 'inherit', cwd: ROOT },
    )
    execFileSync(
      'uv',
      [
        'pip',
        'install',
        '--python',
        join(venv, 'bin', 'python'),
        '--exact',
        '--requirement',
        requirements,
      ],
      { stdio: 'inherit', cwd: ROOT },
    )
    return join(venv, 'bin', 'python')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const at = process.argv.indexOf('--python')
const python = at > 0 ? process.argv[at + 1] : materialise()
const found = readEnvironment(sitePackagesOf(python))

const unread = Object.entries(found)
  .filter(([, entry]) => !entry.spdx)
  .map(([name]) => name)

writeFileSync(DESTINATION, `${JSON.stringify(found, null, 2)}\n`)
console.log(`${Object.keys(found).length} licences → engine/licences.json`)

// Named rather than left as a null in the file: a package whose METADATA states nothing needs a
// hand-written line, and finding that out at notice time is finding it out too late.
if (unread.length > 0) {
  console.log(`\n${unread.length} state no licence and need a line by hand: ${unread.join(', ')}`)
}

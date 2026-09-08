/**
 * Fetches the interpreter the local AI engine runs on, into `resources/engine/`.
 *
 * The person never installs Python: it lands in the bundle the way ffmpeg does. The build is
 * `astral-sh/python-build-standalone` — the same project `uv` uses for its own interpreters —
 * pinned to a release and checked against a recorded digest.
 *
 *     node scripts/fetch-engine.mjs                          # this machine
 *     node scripts/fetch-engine.mjs --platform win32 --arch x64
 *     node scripts/fetch-engine.mjs --sources-only           # recopy engine/src, skip the interpreter
 *     node scripts/fetch-engine.mjs --digests                # after rotating a build
 *
 * This function fetches the interpreter alone. The packaging hook then adds the small, pinned
 * Auto Rig profile to that interpreter; the much larger diffusion profiles remain downloaded on
 * demand. Keeping the two steps separate leaves development startup on the bare core runtime.
 *
 * 🛑 Why diffusion is still NOT shipped. Measured 2026-08-22: the core answers in 33 ms because it
 * imports no tensor library, where a diffusion environment is 682 Mo on macOS, 693 on Windows and
 * 4,7 Go on Linux.
 *
 * 🛑 And what is fetched on first use must be an archive THIS BUILD SIGNED. Measured the same day:
 * an environment resolved on the person's machine will not load under the hardened runtime,
 * because every Mach-O has to carry our signature or `dlopen` refuses it - "different Team IDs".
 * That is why a shipped profile is materialized before signing rather than after installation.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINATION = join(ROOT, 'resources', 'engine')

/** The release these builds come from. Rotating it means changing the digests below with it. */
const RELEASE = '20260814'

/** Exported so the notice states the interpreter it actually ships rather than 'unknown'. */
export const PYTHON = '3.12.14'

/**
 * One build per target, by the triple `python-build-standalone` names them with.
 *
 * `install_only` and not the full build: it carries the interpreter and its standard library
 * without the object files and the test suite, which is what makes it 25 Mo rather than hundreds.
 */
const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-gnu',
}

/**
 * 🛑 Les cibles qui partent SANS moteur. `torch` n'a plus de roue macOS x86-64 depuis la 2.2.2 et
 * `onnxruntime` depuis la 1.23.2 — relevé sur PyPI le 2026-09-07 — donc les deux profils
 * embarqués, Auto Rig et Sélection intelligente, n'y ont aucun binaire installable. Décision
 * d'Alban : livrer le studio entier sur Intel, sans son IA locale, plutôt que rien.
 */
export const ENGINELESS_TARGETS = new Set(['darwin-x64'])

/**
 * Ce qu'une cible sans moteur laisse à empaqueter : RIEN, et le dossier doit exister vide plutôt
 * que d'être absent — `extraResources` le déclare, et une passe précédente du même run y a laissé
 * l'interpréteur de l'AUTRE architecture.
 */
export function emptyEngine() {
  rmSync(DESTINATION, { recursive: true, force: true })
  mkdirSync(DESTINATION, { recursive: true })
}

/**
 * What each archive must hash to, read 2026-08-22. Two builds of one tag must ship the same
 * interpreter, so a rotated URL without a rotated digest fails here rather than shipping
 * something unread. A missing entry REFUSES rather than warns.
 */
const DIGESTS = {
  'aarch64-apple-darwin': '4572133a5542f306b9bdb155da5800f9e38950cd0a98d469b832ce256fe299ea',
  'x86_64-apple-darwin': '1a94c83264731e9603fbea78e57e7ca8f20e7d91eb866627ac2304621b0f6f1f',
  'x86_64-pc-windows-msvc': '7330282b47cd43a66b702d39078d2e5a88e580cee351d82f95045f21f5ee042a',
  'x86_64-unknown-linux-gnu': '3297691ae34f75fed81ac424e040145fccb0bafe8e581cd5cadbddfa1c0766c0',
}

const urlOf = triple =>
  `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/` +
  `cpython-${PYTHON}+${RELEASE}-${triple}-install_only.tar.gz`

/**
 * Puts the committed engine next to the interpreter. Called on every fetch AND every start:
 * skipping it when the interpreter stamp matched is how a copy went days behind the tree.
 */
export function syncEngineSources() {
  mkdirSync(DESTINATION, { recursive: true })
  const dest = join(DESTINATION, 'src')
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  cpSync(join(ROOT, 'engine', 'src'), dest, {
    recursive: true,
    filter: src => basename(src) !== '__pycache__' && !src.endsWith('.pyc'),
  })
  // `core/requirements.py` reads it at `parents[3]` to say what the door's environment is missing.
  // A list copied into Python would drift from the one `uv` resolves; this keeps ONE declaration.
  cpSync(join(ROOT, 'engine', 'pyproject.toml'), join(DESTINATION, 'pyproject.toml'))
}

function tripleFor(platform, arch) {
  const triple = TARGETS[`${platform}-${arch}`]
  if (!triple) throw new Error(`no interpreter build for ${platform}-${arch}`)

  return triple
}

async function download(url, into) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)

  const bytes = new Uint8Array(await response.arrayBuffer())
  writeFileSync(into, bytes)
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Fetches the interpreter for one target, unless the folder already holds that exact build.
 *
 * The marker is the version it was fetched for, so a run for another platform replaces it rather
 * than being skipped — the mistake `before-pack.mjs` exists to prevent for ffmpeg.
 */
export async function fetchEngine(platform = process.platform, arch = process.arch) {
  const triple = tripleFor(platform, arch)
  const stamp = join(DESTINATION, '.fetched')
  const wanted = `${triple}@${RELEASE}`

  const expected = DIGESTS[triple]
  if (!expected) {
    throw new Error(
      `no digest recorded for ${triple}. Run \`node scripts/fetch-engine.mjs --digests\` ` +
        'and write them into DIGESTS before packaging anything with this interpreter.',
    )
  }

  // 🛑 À CÔTÉ de la destination, pas dans le dossier temporaire du système. Sur un runner
  // Windows, `TEMP` est sur C: et le workspace sur D:, et `tar` ne franchit pas les deux lettres
  // de lecteur : « Error is not recoverable », mesuré le 2026-09-07.
  const work = mkdtempSync(join(dirname(DESTINATION), 'ai-desktop-studio-engine-'))
  try {
    const archive = join(work, 'python.tar.gz')
    const digest = await download(urlOf(triple), archive)
    if (digest !== expected) {
      throw new Error(`${triple} hashed ${digest}, expected ${expected}`)
    }

    rmSync(DESTINATION, { recursive: true, force: true })
    mkdirSync(DESTINATION, { recursive: true })
    // `tar` and not a Node unpacker: the archive holds symlinks and executable bits, and both
    // matter — an interpreter whose `python3` link is a copy still runs, one whose bit is lost
    // does not.
    execFileSync('tar', ['xzf', archive, '-C', DESTINATION], { stdio: 'inherit' })

    syncEngineSources()

    writeFileSync(stamp, `${wanted}\n`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

async function printDigests() {
  for (const triple of Object.values(TARGETS)) {
    const work = mkdtempSync(join(tmpdir(), 'ai-desktop-studio-engine-'))
    try {
      const digest = await download(urlOf(triple), join(work, 'python.tar.gz'))
      process.stdout.write(`  '${triple}': '${digest}',\n`)
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argument = name => {
    const at = process.argv.indexOf(`--${name}`)
    return at > 0 ? process.argv[at + 1] : undefined
  }

  if (process.argv.includes('--digests')) await printDigests()
  else if (process.argv.includes('--sources-only')) syncEngineSources()
  else await fetchEngine(argument('platform') ?? process.platform, argument('arch') ?? process.arch)
}

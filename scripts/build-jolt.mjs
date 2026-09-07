/**
 * 🛑 The published single-threaded flavours carry no SIMD — `build.sh` passes `-DENABLE_SIMD=ON`
 * to the multi-threaded target alone. Measured 2026-09-01: the npm build is 2,7 times slower.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Pinned by commit, three past the 1.1.0 tag: the tag links through `emcc`, which emscripten no
 * longer defaults to C++, and dies on `operator new`. The upstream fix is the commit after it.
 */
const JOLT_JS_REPOSITORY = 'https://github.com/jrouwe/JoltPhysics.js.git'
const JOLT_JS_VERSION = '1.1.0'
const JOLT_JS_COMMIT = '3e3b5ff0bae3db323395d72fe1ae1ca693dedc17'

/**
 * 🛑 The compiler is an INPUT, pinned by digest. `latest` is not a version, and 6.0.8 is what
 * `ci/install-emsdk.sh` installs at this commit — `docker inspect --format '{{index .RepoDigests 0}}'`.
 */
const EMSDK_IMAGE =
  'emscripten/emsdk@sha256:f174124ff798a3ead1abef247d9a849c270b642d552fea500a42565ff210f765'

/**
 * What we ship. `ENABLE_SIMD` is the point; `ALLOW_MEMORY_GROWTH` removes a hard abort at 128 Mo
 * and was measured to cost nothing on the scale series — between −4,4 % and +1,5 %.
 */
const SHIPPED_FLAGS = [
  '-DCMAKE_BUILD_TYPE=Distribution',
  '-DBUILD_WASM_COMPAT_ONLY=ON',
  '-DENABLE_SIMD=ON',
  '-DALLOW_MEMORY_GROWTH=ON',
]

/** The same build with SIMD off, kept only to prove the flag reached the compiler. */
const CONTROL_FLAGS = SHIPPED_FLAGS.filter(flag => flag !== '-DENABLE_SIMD=ON')

const WORK = join(ROOT, 'node_modules', '.cache', 'jolt-build')
const VENDOR = join(ROOT, 'vendor', 'jolt-physics')
const ARTEFACT = join(VENDOR, 'dist', 'jolt-physics.wasm-compat.js')
const TYPINGS = join(VENDOR, 'dist', 'types.d.ts')
const MANIFEST = join(VENDOR, 'artefact.json')

const run = (command, args, cwd = ROOT) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', encoding: 'utf8' })

const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex')

function fetchSource() {
  if (!existsSync(join(WORK, '.git'))) {
    mkdirSync(dirname(WORK), { recursive: true })
    run('git', ['clone', '--filter=blob:none', JOLT_JS_REPOSITORY, WORK], dirname(WORK))
  }
  run('git', ['fetch', '--tags', 'origin'], WORK)
  run('git', ['checkout', '--force', JOLT_JS_COMMIT], WORK)
  const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: WORK, encoding: 'utf8' }).trim()
  // 🛑 A tag can be moved. The commit is what was measured, so the commit is what is checked.
  if (at !== JOLT_JS_COMMIT) throw new Error(`checked out ${at}, not ${JOLT_JS_COMMIT}`)
  // `build.sh` does this before anything; without it the typings target dies on a missing folder.
  mkdirSync(join(WORK, 'dist'), { recursive: true })
}

/**
 * 🛑 The output is removed first: two configurations write the same path, and cmake judges an
 * existing one up to date. Two builds landed byte-identical this way on 2026-09-01.
 */
function build(name, flags) {
  const script = [
    'set -e',
    'rm -f dist/jolt-physics.wasm-compat.js',
    `rm -rf Build/${name}`,
    `cmake -B Build/${name} ${flags.join(' ')}`,
    `cmake --build Build/${name} -j$(nproc)`,
  ].join('\n')
  run('docker', [
    'run',
    '--rm',
    '-v',
    `${WORK}:/src`,
    '-w',
    '/src',
    EMSDK_IMAGE,
    'bash',
    '-c',
    script,
  ])

  const made = join(WORK, 'dist', 'jolt-physics.wasm-compat.js')
  if (!existsSync(made)) throw new Error(`${name} produced nothing`)
  return { file: made, sha256: digest(made) }
}

fetchSource()
const shipped = build('shipped', SHIPPED_FLAGS)
copyFileSync(shipped.file, join(WORK, 'shipped.js'))
const control = build('control', CONTROL_FLAGS)

// 🛑 The guard the enquiry paid for: two configurations that differ must not produce the same
// bytes. Equal checksums mean a flag never reached the compiler, and every measure taken on the
// result is worthless.
if (shipped.sha256 === control.sha256) {
  throw new Error(
    'the SIMD build and the control are byte-identical: a flag did not reach the compiler',
  )
}

mkdirSync(join(VENDOR, 'dist'), { recursive: true })
copyFileSync(join(WORK, 'shipped.js'), ARTEFACT)
copyFileSync(join(WORK, 'dist', 'types.d.ts'), TYPINGS)
writeFileSync(
  MANIFEST,
  `${JSON.stringify(
    {
      source: JOLT_JS_REPOSITORY,
      version: JOLT_JS_VERSION,
      commit: JOLT_JS_COMMIT,
      compiler: EMSDK_IMAGE,
      flags: SHIPPED_FLAGS,
      sha256: digest(ARTEFACT),
      bytes: readFileSync(ARTEFACT).length,
      controlSha256: control.sha256,
    },
    null,
    2,
  )}\n`,
)

process.stdout.write(`jolt artefact written, sha256 ${digest(ARTEFACT)}\n`)

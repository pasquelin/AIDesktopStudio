import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENGINE = join(ROOT, 'engine')
const RUNTIME = join(ROOT, 'resources', 'engine')

function pythonOf(platform) {
  return join(RUNTIME, 'python', platform === 'win32' ? 'python.exe' : 'bin/python3')
}

function sitePackagesOf(python) {
  return execFileSync(python, ['-c', 'import sysconfig; print(sysconfig.get_paths()["purelib"])'], {
    encoding: 'utf8',
  }).trim()
}

export function embeddedProfiles() {
  const project = readFileSync(join(ENGINE, 'pyproject.toml'), 'utf8')
  const declaration = /^embedded-profiles\s*=\s*(\[[^\n]+\])$/m.exec(project)?.[1]
  if (!declaration) throw new Error('The engine declares no embedded runtime profiles')

  const profiles = JSON.parse(declaration)
  if (
    !Array.isArray(profiles) ||
    profiles.some(profile => typeof profile !== 'string' || !profile)
  ) {
    throw new Error('The embedded runtime profile declaration is invalid')
  }

  return profiles
}

function metadataValue(text, key) {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text)?.[1]?.trim() ?? null
}

function licenceOf(metadata) {
  const expression = metadataValue(metadata, 'License-Expression')
  if (expression) return expression

  const declared = metadataValue(metadata, 'License')
  if (declared) return declared

  const classified = [...metadata.matchAll(/^Classifier: License :: (.+)$/gm)]
    .map(match => match[1].split(' :: ').pop().trim())
    .find(name => name !== 'OSI Approved')
  return classified ?? null
}

function filesBelow(path, base = path) {
  return readdirSync(path).flatMap(entry => {
    const absolute = join(path, entry)
    return statSync(absolute).isDirectory()
      ? filesBelow(absolute, base)
      : [relative(base, absolute)]
  })
}

function bytesBelow(path) {
  return readdirSync(path).reduce((total, entry) => {
    const absolute = join(path, entry)
    return (
      total + (statSync(absolute).isDirectory() ? bytesBelow(absolute) : statSync(absolute).size)
    )
  }, 0)
}

function distributionBytes(sitePackages, record) {
  return record.split('\n').reduce((total, line) => {
    const relativePath = line.split(',')[0]
    if (!relativePath) return total
    const file = join(sitePackages, relativePath)
    return total + (existsSync(file) ? statSync(file).size : 0)
  }, 0)
}

function removeBytecode(path) {
  for (const entry of readdirSync(path)) {
    const absolute = join(path, entry)
    if (entry === '__pycache__') {
      rmSync(absolute, { recursive: true, force: true })
    } else if (statSync(absolute).isDirectory()) {
      removeBytecode(absolute)
    } else if (entry.endsWith('.pyc')) {
      rmSync(absolute, { force: true })
    }
  }
}

function runtimeManifest(sitePackages, platform, arch) {
  const nativeSuffixes = ['.dylib', '.dll', '.pyd', '.so']
  const distributions = readdirSync(sitePackages)
    .filter(entry => entry.endsWith('.dist-info'))
    .map(entry => {
      const directory = join(sitePackages, entry)
      const metadata = readFileSync(join(directory, 'METADATA'), 'utf8')
      const wheel = readFileSync(join(directory, 'WHEEL'), 'utf8')
      const record = readFileSync(join(directory, 'RECORD'), 'utf8')
      const native = record
        .split('\n')
        .some(line => nativeSuffixes.some(suffix => line.split(',')[0].endsWith(suffix)))
      return {
        name: metadataValue(metadata, 'Name')?.toLowerCase().replace(/[._]+/g, '-'),
        version: metadataValue(metadata, 'Version'),
        licence: licenceOf(metadata),
        wheelFilename: `${entry.slice(0, -'.dist-info'.length)}-${
          /^Tag:\s*(.+)$/m.exec(wheel)?.[1] ?? 'unknown'
        }.whl`,
        native,
        bytes: distributionBytes(sitePackages, record),
      }
    })
    .filter(distribution => distribution.name !== 'ai-desktop-studio-engine')
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    schemaVersion: 1,
    platform,
    arch,
    python: execFileSync(pythonOf(platform), ['--version'], { encoding: 'utf8' }).trim(),
    profiles: embeddedProfiles(),
    files: filesBelow(sitePackages).length,
    bytes: bytesBelow(sitePackages),
    distributions,
  }
}

const encodeManifest = manifest => `${JSON.stringify(manifest, null, 2)}\n`

function writeRuntimeManifest(manifest) {
  writeFileSync(join(RUNTIME, 'runtime-manifest.json'), encodeManifest(manifest))
  console.log(
    `Embedded runtime: ${manifest.bytes} bytes (${manifest.distributions
      .map(distribution => `${distribution.name} ${distribution.bytes}`)
      .join(', ')})`,
  )
}

/**
 * 🛑 LINUX ONLY. `uv pip install` reads no project config, so the index `engine/pyproject.toml`
 * declares has to be named here too — the export asks for `torch==2.14.0+cpu`, which PyPI does
 * not carry. `unsafe-best-match` with it, the default stopping at the first index holding ANY
 * version of a package, and PyPI holding torch.
 *
 * Never elsewhere: the PyTorch index also publishes a plain `2.14.0`, a DIFFERENT artefact from
 * PyPI's, and the two indexes searched together made uv take that one on macOS — `Hash mismatch
 * for torch==2.14.0`, measured 2026-09-08. Hashes do not PREVENT a substitution, they catch it.
 */
const cpuIndexFor = platform =>
  platform === 'linux'
    ? [
        '--extra-index-url',
        'https://download.pytorch.org/whl/cpu',
        '--index-strategy',
        'unsafe-best-match',
      ]
    : []

function installRequirements(python, requirements, platform) {
  execFileSync(
    'uv',
    [
      'pip',
      'install',
      '--python',
      python,
      '--exact',
      '--only-binary',
      ':all:',
      ...cpuIndexFor(platform),
      '--requirement',
      requirements,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  )
}

export function prepareEngineRuntime(platform = process.platform, arch = process.arch) {
  const python = pythonOf(platform)
  if (!existsSync(python)) throw new Error('Fetch the embedded Python runtime before preparing it')

  const work = mkdtempSync(join(tmpdir(), 'ai-desktop-studio-runtime-'))
  try {
    const requirements = join(work, 'requirements.txt')
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
      { cwd: ROOT, stdio: 'inherit' },
    )
    installRequirements(python, requirements, platform)
    const sitePackages = sitePackagesOf(python)
    removeBytecode(join(RUNTIME, 'python'))
    const manifest = runtimeManifest(sitePackages, platform, arch)
    writeRuntimeManifest(manifest)
    return manifest
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// `engine/embedded-runtime.json` is TRACKED: `collect-licences.mjs` reads it and a test pins the
// distributions it names. A pack for another target would leave that target's list there, on a file
// nobody edited — so only a deliberate regeneration writes it, never the pack hook.
if (process.argv[1] === fileURLToPath(import.meta.url))
  writeFileSync(join(ENGINE, 'embedded-runtime.json'), encodeManifest(prepareEngineRuntime()))

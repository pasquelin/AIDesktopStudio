/**
 * Gives the development run the product's name and icon instead of Electron's.
 *
 * macOS reads the Dock label, the menu bar title and the icon from the running bundle, never
 * from `app.setName()` — the Electron docs are explicit that it "does not change the name
 * displayed by the operating system", and that the first application submenu "will always have
 * your application's name as its label". Unpackaged, that bundle is
 * `node_modules/.../Electron.app`, so the studio shows up as Electron with an atom beside it.
 *
 * A packaged build needs none of this: electron-builder writes a real bundle from
 * `productName` and `build/icon.png`. This only exists so development looks like the product.
 *
 * Runs on postinstall because pnpm re-extracts the bundle whenever Electron is reinstalled.
 * Takes an optional checkout root, so an existing worktree can be fixed without waiting for
 * its branch to carry this file: `node scripts/dev-app-identity.mjs .claude/worktrees/<name>`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLIST_BUDDY = '/usr/libexec/PlistBuddy'

/** Stamped into the bundle so the work is skipped when it is already done — icon included. */
const STAMP_KEY = 'DevAppIdentity'

/** The sizes an `.icns` is expected to carry, as `iconutil` names them. */
const ICON_SIZES = [
  [16, 'icon_16x16'],
  [32, 'icon_16x16@2x'],
  [32, 'icon_32x32'],
  [64, 'icon_32x32@2x'],
  [128, 'icon_128x128'],
  [256, 'icon_128x128@2x'],
  [256, 'icon_256x256'],
  [512, 'icon_256x256@2x'],
  [512, 'icon_512x512'],
  [1024, 'icon_512x512@2x'],
]

/**
 * The one entry of a folder that answers `wanted`, or nothing when it holds none or several.
 *
 * 🛑 Whatever it is CALLED, never `Electron.app` by name: the bundle carries the product's name
 * once this has run, so after the product is RENAMED it sits under the previous one — and a
 * script looking for Electron's finds neither and exits without a word. Measured on the rebrand
 * of 2026-09-07, which left the menu bar reading the old name for weeks of `pnpm start`, beside
 * an « About » item carrying the new one.
 */
function onlyIn(folder, wanted) {
  const found = existsSync(folder) ? readdirSync(folder).filter(wanted) : []
  return found.length === 1 ? join(folder, found[0]) : null
}

// Nothing to dress up on a runner: no one looks at the Dock, and electron-builder writes the
// shipped bundle from scratch. `CI` rather than `GITHUB_ACTIONS` — every platform sets it.
if (process.env.CI) {
  console.log('CI: leaving the Electron bundle untouched.')
  process.exit(0)
}

if (process.platform !== 'darwin') process.exit(0)

const projectRoot = process.argv[2]
  ? resolve(process.argv[2])
  : dirname(dirname(fileURLToPath(import.meta.url)))
const iconSource = join(projectRoot, 'build', 'icon.png')

// READ, never spelt again: this file sits outside `src/`, so neither the typecheck nor
// `constants.test.ts` — which pins `APP_NAME` against this very field — could catch a copy drifting
// here. The manifest is already in hand for `createRequire` below.
const { productName: PRODUCT_NAME } = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8'),
)

/**
 * Builds the `.icns` macOS reads from the same PNG electron-builder packages, so the icon in
 * development and the icon in a release can never drift apart.
 */
function buildIcns(target) {
  const iconset = mkdtempSync(join(tmpdir(), 'ai-desktop-studio-icon-')) + '.iconset'
  execFileSync('mkdir', ['-p', iconset])

  try {
    for (const [size, name] of ICON_SIZES) {
      const out = join(iconset, `${name}.png`)
      execFileSync('sips', ['-z', String(size), String(size), iconSource, '--out', out], {
        stdio: 'ignore',
      })
    }

    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', target], { stdio: 'ignore' })
  } finally {
    rmSync(iconset, { recursive: true, force: true })
  }
}

try {
  // `resolve`, not `require`: loading Electron's entry point downloads the binary when `dist/`
  // is missing — or throws. Neither belongs in an install that only wanted a cosmetic name.
  // From the target checkout, not from this file: a worktree has its own node_modules.
  const electronRoot = dirname(createRequire(join(projectRoot, 'package.json')).resolve('electron'))
  const dist = join(electronRoot, 'dist')

  // Dependency build scripts blocked, or a fresh checkout: nothing to rename yet.
  if (!existsSync(dist) || !existsSync(iconSource)) process.exit(0)

  const bundle = join(dist, `${PRODUCT_NAME}.app`)
  const plist = join(bundle, 'Contents', 'Info.plist')
  const identity = `${PRODUCT_NAME}:${createHash('sha256').update(readFileSync(iconSource)).digest('hex')}`

  // What `require('electron')` reads to find the binary. Re-extracting the archive puts a fresh
  // `Electron.app` BESIDE the bundle we renamed and points this back at it, which leaves the
  // studio launching under Electron's name and icon while our bundle sits there, intact.
  const pathFile = join(electronRoot, 'path.txt')
  const wiring = `${PRODUCT_NAME}.app/Contents/MacOS/${PRODUCT_NAME}`

  // stderr dropped: PlistBuddy writes "Does Not Exist" there before failing, and asking whether
  // a key is present is a normal thing to do — it should not print anything.
  const plistBuddy = command =>
    execFileSync(PLIST_BUDDY, ['-c', command, plist], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })

  const stamped = () => {
    try {
      return plistBuddy(`Print :${STAMP_KEY}`).trim() === identity
    } catch {
      return false
    }
  }

  // Named AND sealed, not just named: a run that renamed the bundle then failed to re-sign it
  // left something macOS refuses to launch, and a name-only check would call that job done.
  const sealed = () => {
    try {
      execFileSync('codesign', ['--verify', bundle], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }

  /** Named and sealed says nothing about which bundle is LAUNCHED — see `pathFile` above. */
  const wired = () => {
    try {
      return readFileSync(pathFile, 'utf8').trim() === wiring
    } catch {
      return false
    }
  }

  if (existsSync(bundle) && stamped() && sealed() && wired()) process.exit(0)

  if (!existsSync(bundle)) {
    const original = onlyIn(dist, one => one.endsWith('.app'))
    if (!original) process.exit(0)
    renameSync(original, bundle)
  }

  // The process name — what the Dock and `ps` show — comes from the executable, so the bundle
  // alone is not enough: renamed bundle, unrenamed binary, and macOS still says Electron.
  const executable = join(bundle, 'Contents', 'MacOS', PRODUCT_NAME)
  if (!existsSync(executable)) {
    const original = onlyIn(join(bundle, 'Contents', 'MacOS'), () => true)
    if (original) renameSync(original, executable)
  }

  plistBuddy(`Set :CFBundleName ${PRODUCT_NAME}`)
  plistBuddy(`Set :CFBundleDisplayName ${PRODUCT_NAME}`)
  plistBuddy(`Set :CFBundleExecutable ${PRODUCT_NAME}`)

  // The bundle's own icon, rather than `app.dock.setIcon` at runtime: once the bundle is the
  // product's, the icon it carries is what the Dock draws before the app has run a line.
  buildIcns(join(bundle, 'Contents', 'Resources', 'electron.icns'))

  writeFileSync(pathFile, wiring)

  // Stamped before sealing: the seal has to cover the stamp, or the next run finds a bundle
  // whose signature no longer matches and redoes everything.
  try {
    plistBuddy(`Delete :${STAMP_KEY}`)
  } catch {
    // Not stamped yet — deleting what is not there fails, and that is the normal first run.
  }
  plistBuddy(`Add :${STAMP_KEY} string ${identity}`)

  // Editing a bundle breaks its ad-hoc signature, and macOS refuses to launch what no longer
  // matches its own seal. Re-sealing ad-hoc is what keeps `pnpm start` working.
  execFileSync('codesign', ['--force', '--sign', '-', bundle], { stdio: 'ignore' })

  console.log(`[dev-app-identity] development runs as "${PRODUCT_NAME}", with its own icon`)
} catch (error) {
  // Never fail an install over a cosmetic name: the app runs either way.
  console.warn(`[dev-app-identity] skipped — ${error instanceof Error ? error.message : error}`)
}

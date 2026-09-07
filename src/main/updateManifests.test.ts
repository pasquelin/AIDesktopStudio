import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockMapsExpected, manifestFiles } from './updateManifests'

const ROOT = join(import.meta.dirname, '..', '..')
const read = (name: string) => readFileSync(join(ROOT, name), 'utf8')

// Copied from the artefacts of the v0.1.0 run, sha512 elided. Hand-written fixtures would only
// have described what I expected electron-builder to write — and what it writes is the point.
const WINDOWS = `version: 0.1.0
files:
  - url: ai-desktop-studio-0.1.0-win32-x64.exe
    sha512: V305V2nh0hZ6noVoHy8Q==
    size: 200131728
path: ai-desktop-studio-0.1.0-win32-x64.exe
releaseDate: '2026-08-15T16:31:23.352Z'
`

const LINUX = `version: 0.1.0
files:
  - url: ai-desktop-studio-0.1.0-linux-x86_64.AppImage
    sha512: J80jADro4XRqeL7l==
    size: 270295604
    blockMapSize: 283208
  - url: ai-desktop-studio-0.1.0-linux-amd64.deb
    sha512: WExicXx6cFIGD5FY==
    size: 212821228
path: ai-desktop-studio-0.1.0-linux-x86_64.AppImage
releaseDate: '2026-08-15T16:30:26.583Z'
`

describe('the block maps a manifest requires beside it', () => {
  it('names one for an installer that declares no size of its own', () => {
    expect(blockMapsExpected(WINDOWS)).toEqual(['ai-desktop-studio-0.1.0-win32-x64.exe.blockmap'])
  })

  it('names none for Linux, whose AppImage carries its own and whose deb never updates', () => {
    // The v0.1.0 pipeline refused to publish over exactly this: it demanded a file for both.
    expect(blockMapsExpected(LINUX)).toEqual([])
  })

  it('reads every listed file, not only the updatable ones', () => {
    expect(manifestFiles(LINUX).map(file => file.url)).toEqual([
      'ai-desktop-studio-0.1.0-linux-x86_64.AppImage',
      'ai-desktop-studio-0.1.0-linux-amd64.deb',
    ])
  })

  it('attaches a declared size to the entry it follows, not to the next one', () => {
    expect(manifestFiles(LINUX).map(file => file.carriesItsOwn)).toEqual([true, false])
  })
})

/**
 * That the job still calls it. Dropping the step, or going back to the shell loop that demanded a
 * `.blockmap` for every listed file, leaves `pnpm validate` green and shows up only when a tag
 * refuses to publish — which is how the v0.1.0 run was spent.
 *
 * Read as steps rather than as text, for the reason `artefact.test.ts` gives: a guard a `#`
 * disarms is one the next rebase disarms by accident.
 */
describe('the release job', () => {
  const steps = read('.github/workflows/release.yml')
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
    .join('\n')

  it('checks the manifests through this rule', () => {
    expect(steps).toContain('node scripts/check-manifests.mjs')
  })
})

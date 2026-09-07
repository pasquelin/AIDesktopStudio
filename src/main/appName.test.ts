import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@shared/constants'

/**
 * The surfaces that spell the product's name and cannot import it.
 *
 * `constants.test.ts` pins the one copy TypeScript can reach — `package.json`. These cannot be
 * reached at all: two are separate Vite entries, one is read by electron-builder, two by macOS
 * itself, and the script runs outside the typecheck. Each is one silent drift away from a studio
 * that answers to two names, which is exactly what a rename leaves behind when it misses a file.
 *
 * Read as data, from the main process, for the reason `window/theme.test.ts` gives.
 */
const SPELT_BY_HAND = [
  'electron-builder.yml',
  'src/renderer/index.html',
  'src/renderer/splash.html',
  'build/lproj/en.lproj/InfoPlist.strings',
  'build/lproj/fr.lproj/InfoPlist.strings',
]

const fileAt = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('the product name', () => {
  for (const path of SPELT_BY_HAND) {
    it(`is what ${path} carries`, () => {
      expect(fileAt(path)).toContain(APP_NAME)
    })
  }

  /**
   * Presence alone proves nothing: a file left on the previous name still holds the new one
   * elsewhere, so every case above would pass while the studio shipped under two names at once.
   */
  it('is the only product name those surfaces carry', () => {
    expect(SPELT_BY_HAND.filter(path => fileAt(path).includes('Scenario Studio'))).toEqual([])
    expect(SPELT_BY_HAND.filter(path => fileAt(path).includes('IA Studio'))).toEqual([])
  })

  // `dev-app-identity.mjs` used to hold a sixth copy. It reads `package.json` now, so the case
  // that would have guarded it guards that it still does.
  it('is read from the manifest by the development identity script, never spelt again', () => {
    const script = fileAt('scripts/dev-app-identity.mjs')

    expect(script).toContain('productName: PRODUCT_NAME')
    expect(script).not.toContain(`'${APP_NAME}'`)
  })
})

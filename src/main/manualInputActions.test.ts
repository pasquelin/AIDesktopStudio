import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { INPUT_PRESET_IDS, inputMapPreset } from '@shared/domain/inputPresets'

/**
 * That the manual's control chapter names things the code still has.
 *
 * 🛑 The manual is read INSIDE the application, and it has been corrected four times on claims
 * that were simply false. Nothing held it against the code: an action renamed in a preset left
 * the chapter naming one that no longer exists, and a preset added left it silent — both green
 * everywhere.
 *
 * 🛑 What it does NOT cover, in plain words rather than counted: the KEYS. The tables spell
 * `W`, `Espace`, `F` in prose, in two languages, and holding those against the bindings would
 * mean parsing a table of French gestures — so a rebound default still goes unnoticed here.
 * Nor does it read the chapters other than the modelling one.
 */
const CHAPTERS: readonly string[] = [
  'docs/fr/manuel/09-espace-modelisation.md',
  'docs/en/manual/09-modelling-workspace.md',
]

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const chapterOf = (path: string): string => readFileSync(`${ROOT}${path}`, 'utf8')

/** The `x` of every `` `x` `` on the lines that enumerate a context's actions. */
function actionsNamed(text: string): readonly string[] {
  const line = text.split('\n').find(one => /\*\*actions\*\*/.test(one))
  return [...(line ?? '').matchAll(/`([a-z][A-Za-z]*)`/g)].map(found => found[1] ?? '')
}

/** The basename of every `` `…/x.input.json` `` the chapter cites. */
function mapsNamed(text: string): readonly string[] {
  return [...text.matchAll(/`[^`]*?([A-Za-z-]+)\.input\.json`/g)].map(found => found[1] ?? '')
}

describe.each(CHAPTERS)('the control section of %s', path => {
  const text = chapterOf(path)

  it('enumerates exactly the actions the character preset declares', () => {
    expect(actionsNamed(text)).toEqual(inputMapPreset('character').actions.map(one => one.id))
  })

  it('names no control map file that is not a preset', () => {
    const unknown = mapsNamed(text).filter(id => !INPUT_PRESET_IDS.some(preset => preset === id))

    expect(unknown).toEqual([])
  })

  it('cites at least one control map file, so the two guards above are not vacuous', () => {
    expect(mapsNamed(text).length).toBeGreaterThan(0)
  })
})

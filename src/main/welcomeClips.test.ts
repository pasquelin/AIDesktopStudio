import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ANIMATION_EXTENSIONS, BUNDLED_ANIMATION_POSTERS } from '@shared/domain/animationLibrary'
import { bundledCharacterFile } from '@shared/domain/bundledCharacter'
import { CHARACTER_LEVELS } from '@shared/domain/characterLevel'
import { WELCOME_CLIP_NAMES } from '@shared/domain/welcome'
import { byCodeUnit } from '@shared/text'

/**
 * The shipped folders, read off the disk. The welcome names its clips by string and reads them
 * over the asset scheme: a folder renamed leaves the typecheck, the lint and the suite VERT, and
 * the character simply never moves.
 */
const RESOURCES = join(import.meta.dirname, '../../resources')

/**
 * 🛑 Every shipped folder is DESCRIBED, and nothing describes a folder that does not ship. The
 * table decides where a still is taken in a clip; a folder missing from it is drawn by sampling,
 * silently, and an entry naming nothing is a name that was renamed on disk and nowhere else.
 */
describe('the stills of the animations shipped beside the app', () => {
  it('describes exactly the folders that are there', () => {
    const shipped = readdirSync(join(RESOURCES, 'animations'), { withFileTypes: true })
      .filter(one => one.isDirectory())
      .map(one => one.name)
      .toSorted(byCodeUnit)

    expect(Object.keys(BUNDLED_ANIMATION_POSTERS).toSorted(byCodeUnit)).toEqual(shipped)
  })
})

const clipIn = (folder: string): boolean =>
  readdirSync(folder).some(file => ANIMATION_EXTENSIONS.some(suffix => file.endsWith(suffix)))

describe('what the welcome backdrop reads from beside the app', () => {
  it('finds a shipped clip for every animation it names', () => {
    const missing = WELCOME_CLIP_NAMES.filter(name => {
      const folder = join(RESOURCES, 'animations', name)
      return !existsSync(folder) || !clipIn(folder)
    })

    expect(missing).toEqual([])
  })

  it('finds the shipped character at every density, the welcome taking the heaviest', () => {
    const missing = CHARACTER_LEVELS.filter(
      level => !existsSync(join(RESOURCES, 'characters', bundledCharacterFile(level))),
    )

    expect(missing).toEqual([])
  })
})

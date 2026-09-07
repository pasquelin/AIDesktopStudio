import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { natureOf } from '@shared/domain/fileRole'
import { FOLDER_ROLES } from '@shared/domain/folderRole'
import { domainInk, roleInk } from './workspaces'

/**
 * The hue a row's glyph takes, per row — what `Explorer.inkFor` reaches for on every entry it
 * draws. The panel virtualises, so this multiplies by the rows on screen; a listing redraws on
 * every keystroke of the filter.
 *
 * **Measured 2026-08-28** (macOS, M2 Pro, Node 24.8), per entry: 0.0002 ms for a file, whose
 * nature is read off its name, and 0.00003 for a folder answering from two tables.
 */
const NAMES: readonly string[] = [
  'plate.png',
  'rush.mp4',
  'theme.wav',
  'brick.mtlx',
  'dusk.gltf',
  'level.ts',
  'notes.txt',
]

// Ten roles against seven names: near enough for the two rows to be read side by side, which one
// call against seven was not.
describe('inking one row by the section it belongs to', () => {
  bench('a file, whose nature is read off its name', () => {
    for (const name of NAMES) domainInk(natureOf(name).domain)
  })

  bench('a folder serving a section, which is two table lookups', () => {
    for (const role of FOLDER_ROLES) roleInk(role)
  })
})

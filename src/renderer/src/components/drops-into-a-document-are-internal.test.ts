import { describe, expect, it } from 'vitest'
import { WINDOW_SOURCES } from '../windowSources'
import { withoutComments } from './sourceText'

/**
 * G-V, held by a guard — §7: a file dropped INTO a document is a resource of that document, and
 * nothing new appears in the explorer for it.
 *
 * Every `AssetDropTarget` places what it takes into something the user is editing, so every one
 * of them declares `filesAreInternal`. It is one prop, invisible on screen and silent when it is
 * missing: the file simply lands in the project's tree and stays there when the layer, the clip
 * or the node it became is undone (E-14). Nothing else in the gate reads it.
 *
 * 🛑 **Its two blind spots, written rather than hidden.** It reads the prop as TEXT, so a target
 * assembling its props from a spread — `{...dropProps}` — passes without declaring anything; and
 * it sees only `AssetDropTarget`, where the timeline calls `importExternalFilesInto` itself and
 * says the same thing as a positional argument. Neither has a second case today, and a review is
 * what would catch the first.
 */

/** The one surface that FILES rather than places, and the reason it is the exception. */
const FILES_RATHER_THAN_PLACES: readonly string[] = [
  // Dropping beside the tabs copies a file into the project (R2). It opens no document and
  // places nothing, so a resource of a document is exactly what it must not make.
  'features/shell/components/Document/DocumentArea.tsx',
  // The component itself, which declares the prop rather than passing it.
  'components/AssetDropTarget.tsx',
]

const OPENS_A_TARGET = /<AssetDropTarget\b/

function findingsOf(): string[] {
  const loose: string[] = []

  for (const [path, code] of Object.entries(WINDOW_SOURCES)) {
    const relative = path.replace('./', '')
    if (FILES_RATHER_THAN_PLACES.some(allowed => relative.endsWith(allowed))) continue

    const source = withoutComments(code)
    if (!OPENS_A_TARGET.test(source)) continue
    // Per FILE and not per tag: a component holding two targets declares the prop on each, and a
    // count would pass one that declared it twice.
    const targets = source.match(new RegExp(OPENS_A_TARGET.source, 'g'))?.length ?? 0
    const internal = source.match(/\bfilesAreInternal\b/g)?.length ?? 0
    if (internal < targets) loose.push(relative)
  }
  return loose.sort()
}

describe('a drop into a document makes a resource of it, never a file of the project', () => {
  it('is what every surface that takes one declares', () => {
    expect(findingsOf()).toEqual([])
  })

  // Reading nothing would satisfy the assertion above for ever.
  it('reads the surfaces it is meant to read', () => {
    const swept = Object.keys(WINDOW_SOURCES).filter(path =>
      OPENS_A_TARGET.test(withoutComments(WINDOW_SOURCES[path] ?? '')),
    )

    expect(swept.length).toBeGreaterThan(5)
  })
})

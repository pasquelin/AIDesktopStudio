import { describe, expect, it } from 'vitest'
import { AFFINITY_BY_WORKSPACE, CREATABLES, creatablesFor } from './creatable'
import { DOCUMENT_KINDS, isMadeFromNothing } from './document'
import { HOME_SURFACE } from './tool'
import { WORKSPACE_IDS } from './workspace'

describe('creatables', () => {
  /**
   * The defect this table exists to close: the New button read the HEAD of each space's kinds, so
   * `gui` could not be made from anywhere, and every gate stayed green over it.
   *
   * Every kind one can MAKE, which is every kind but the character: that tab is opened on a model
   * the library already holds, and a blank one would carry no mesh at all.
   */
  it('offers every kind that can be made from nothing, exactly once', () => {
    expect([...CREATABLES].map(one => one.kind).sort()).toEqual(
      [...DOCUMENT_KINDS].filter(isMadeFromNothing).sort(),
    )
  })

  it('leaves out what can only be opened on something', () => {
    expect([...CREATABLES].map(one => one.kind)).not.toContain('character')
  })

  /**
   * Nothing makes this table complete — the compiler only demands a row per space, not what is in
   * it. A row short of a space silently drops it from the far end of every list.
   */
  it('places every other space in each row of the affinity table', () => {
    for (const workspace of WORKSPACE_IDS) {
      const others = WORKSPACE_IDS.filter(one => one !== workspace)
      expect([...AFFINITY_BY_WORKSPACE[workspace]].sort()).toEqual([...others].sort())
    }
  })

  it('brings the surface one stands on to the front, keeping all the rest', () => {
    const offered = creatablesFor('3d')

    expect(offered.map(one => one.kind).slice(0, 2)).toEqual(['scene', 'gui'])
    expect(offered.map(one => one.kind).slice(2, 4)).toEqual(['material', 'skybox'])
    expect(offered).toHaveLength(CREATABLES.length)
  })

  /** The home makes no document of its own, so it has no space to bring forward. */
  it('offers the rail order on the home and on no surface at all', () => {
    expect(creatablesFor(HOME_SURFACE)).toEqual(CREATABLES)
    expect(creatablesFor(null)).toEqual(CREATABLES)
  })
})

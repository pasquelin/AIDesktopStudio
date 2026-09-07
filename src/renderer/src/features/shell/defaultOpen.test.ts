import { describe, expect, it } from 'vitest'
import { SLOTS, ZONES, type Slot, type Zone } from '@pasquelin/panels'
import { familyOf, HOME_SURFACE, TOOL_PLACEMENTS, type SurfaceFamily } from '@shared/domain/tool'
import { DEFAULT_OPEN } from './defaultOpen'

/** Every half a family has a panel for, derived rather than restated — see the case below. */
function halvesOf(family: SurfaceFamily): string[] {
  return TOOL_PLACEMENTS.filter(placement =>
    placement.surfaces.some(surface => familyOf(surface) === family),
  )
    .map(placement => `${placement.zone}/${placement.slot}`)
    .filter((half, index, all) => all.indexOf(half) === index)
    .sort()
}

const FAMILIES: SurfaceFamily[] = ['workspaces', 'home']

function namedIn(family: SurfaceFamily): string[] {
  const open = DEFAULT_OPEN[family]
  return ZONES.flatMap((zone: Zone) =>
    SLOTS.filter((slot: Slot) => open[zone] !== undefined && slot in open[zone]).map(
      slot => `${zone}/${slot}`,
    ),
  ).sort()
}

describe('the halves a first launch opens', () => {
  /**
   * Derived from the placements rather than restated, in BOTH directions: a half nothing is
   * declared for would hold a size and a handle over nothing, and one this forgets stays shut for
   * good — `settle` runs once per view, so no later launch reopens it.
   */
  it('names exactly the halves each family has a panel for', () => {
    for (const family of FAMILIES) {
      expect(namedIn(family)).toEqual(halvesOf(family))
    }
  })

  // Naming one would pick a section's answer — the layers, the montage, the sky — and impose it
  // on the other five. Which panel a half opens on is resolved against the surface in front.
  it('names no panel in any of them', () => {
    const named = Object.values(DEFAULT_OPEN).flatMap(open =>
      Object.values(open).flatMap(slots => Object.values(slots)),
    )

    // The anchor: an empty table satisfies "no panel is named" without opening anything at all.
    expect(named.length).toBeGreaterThan(0)
    for (const tool of named) expect(tool).toBeNull()
  })

  it('gives the home its own halves, which are not the spaces’', () => {
    expect(familyOf(HOME_SURFACE)).toBe('home')
    // No lower right: an inspector has no selection to read on a screen holding no document.
    expect(namedIn('home')).not.toContain('right/secondary')
    expect(namedIn('workspaces')).toContain('right/secondary')
  })
})

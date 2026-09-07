import { describe, expect, it } from 'vitest'
import { openOf, shownIn, type OpenByZone } from '@pasquelin/panels'
import { familyOf, HOME_SURFACE, type ToolId, type ToolSurface } from '@shared/domain/tool'
import { useLayouts } from '@/stores/layouts'
import { panelsStore } from '@/stores/panels'
import { chassisFor } from '@/stores/panels-fixtures'
import { migrateTools } from './migrateTools'

/** The chassis as `<Panels>` builds it from a migrated layout: restored, declared, then settled. */
function restored(layout: ReturnType<typeof migrateTools>, surface: ToolSurface) {
  chassisFor(surface, layout.views[familyOf(surface)])
  return panelsStore.getState()
}

/** The workspaces' halves a layout stored in version 8 — the last flat one — comes back with. */
const openFrom = (open: unknown): OpenByZone<ToolId> | undefined =>
  migrateTools({ open }, 8).views.workspaces

describe('reading what the tools store wrote', () => {
  // Everything version 8 stored was the workspaces': one arrangement, flat at the root, since the
  // home had no zones of its own to arrange.
  it('reads a version 8 layout as the workspaces, and leaves the home to be settled', () => {
    const migrated = migrateTools(
      { open: { right: { primary: 'layers' } }, sizes: { left: 400 } },
      8,
    )

    expect(migrated.views.workspaces?.right).toEqual({ primary: 'layers' })
    expect(migrated.lengths.sizes).toEqual({ left: 400 })
    expect(migrated.views.home).toBeUndefined()
  })

  // The shape from version 9 on — `partialize` publishes `arrangements`. Read as the flat one,
  // none of `open`, `sizes` and `splits` is found, and every space goes back to the factory.
  it('keeps what version 9 wrote under `arrangements`', () => {
    const migrated = migrateTools(
      {
        arrangements: {
          workspaces: { open: { right: { primary: 'layers' } }, sizes: { left: 400 }, splits: {} },
          home: { open: { left: { secondary: 'projects' } }, sizes: {}, splits: {} },
        },
      },
      9,
    )

    expect(migrated.views.workspaces?.right).toEqual({ primary: 'layers' })
    expect(migrated.lengths.sizes).toEqual({ left: 400 })
    // The home is the one every bump below 20 changes: it is left out, so the chassis opens it
    // on the halves declared today rather than on the two that version knew.
    expect(migrated.views.home).toBeUndefined()
  })

  // 🛑 A `ToolId` ARRIVING costs as much as one leaving: version 19 knew no right column on the
  // home, so its arrangement names the halves it had. Carried over, the assistant would be
  // reachable from the home by ⌘K alone, for ever, on every installed profile.
  it('opens the home on the assistant, which a version 19 arrangement cannot name', () => {
    useLayouts.setState({ home: true })
    const migrated = migrateTools(
      {
        arrangements: {
          workspaces: { open: { right: { primary: 'layers' } } },
          home: {
            open: { left: { primary: null, secondary: null }, bottomRight: { primary: null } },
          },
        },
      },
      19,
    )

    expect(shownIn(restored(migrated, HOME_SURFACE), 'right').primary).toBe('assistant')
  })

  // The version the store last wrote named the home honestly, so it is carried over as it
  // stands — closing a half there must survive a restart.
  it('keeps the home a version 20 layout named, half for half', () => {
    const migrated = migrateTools(
      {
        arrangements: {
          workspaces: { open: { left: { primary: null } } },
          home: { open: { left: { primary: 'projects' }, right: {} } },
        },
        lengths: { sizes: {}, splits: {} },
      },
      20,
    )

    expect(migrated.views.home).toEqual({ left: { primary: 'projects' }, right: {} })
    expect(shownIn(restored(migrated, HOME_SURFACE), 'right').primary).toBeUndefined()
  })

  // The band was ONE zone up to version 14. Dropped as an unknown key, the panel it held would
  // come back closed and the height it was dragged to would go back to the factory's.
  it('lands a version 14 band on the right half, height and all', () => {
    const migrated = migrateTools(
      {
        arrangements: {
          workspaces: { open: { bottom: { primary: 'timeline' } }, sizes: { bottom: 400 } },
        },
      },
      14,
    )

    expect(migrated.views.workspaces?.bottomRight).toEqual({ primary: 'timeline' })
    expect(migrated.lengths.sizes.bottomRight).toBe(400)
  })

  // The shelf moved to the left column on 17 August: a version 14 band holding it comes back
  // open and empty, its height kept all the same — the zone is still there.
  it('empties a version 14 band that held the shelf, keeping the half and its height', () => {
    const migrated = migrateTools(
      {
        arrangements: {
          workspaces: { open: { bottom: { primary: 'assets' } }, sizes: { bottom: 400 } },
        },
      },
      14,
    )

    expect(migrated.views.workspaces?.bottomRight).toEqual({})
    expect(migrated.views.workspaces?.left).toEqual({ primary: 'assets' })
    expect(migrated.lengths.sizes.bottomRight).toBe(400)
  })

  // 🛑 Version 16 took the lengths OUT of the per-family arrangement and up to the root. Read
  // only where they used to live, every width dragged from 16 onwards came back factory.
  it('reads the lengths version 16 moved to the root', () => {
    const migrated = migrateTools(
      {
        arrangements: { workspaces: { open: { left: { primary: null } } } },
        lengths: { sizes: { left: 400 }, splits: { right: 180 }, bandSplit: 300 },
      },
      16,
    )

    expect(migrated.lengths).toEqual({
      sizes: { left: 400 },
      splits: { right: 180 },
      bandSplit: 300,
    })
  })

  // A layout whose halves are unreadable still carries its lengths, and the chassis settles the
  // views: a corrupted arrangement must not also cost the widths, which are stored apart.
  it('settles every view when the arrangements cannot be read, keeping the lengths', () => {
    const migrated = migrateTools({ arrangements: 'gone', lengths: { sizes: { left: 400 } } }, 20)

    expect(migrated.views).toEqual({})
    expect(migrated.lengths.sizes).toEqual({ left: 400 })
    expect(openOf(restored(migrated, 'image')).left).toEqual({
      primary: null,
      secondary: null,
    })
  })
})

describe('the arrangement a first launch settles on', () => {
  // The shape the studio stores and the shape it settles on are the same shape, or every launch
  // would rearrange the window a little.
  it('survives a round trip through the persisted shape', () => {
    const settled = openOf(restored({ views: {}, lengths: { sizes: {}, splits: {} } }, 'image'))

    expect(openFrom(settled)).toEqual(settled)
  })
})

describe('a layout stored before the placements moved', () => {
  it('migrates the single id version 2 stored into the slot its tool declares', () => {
    expect(openFrom({ right: 'inspector' })).toEqual({ right: { secondary: 'inspector' } })
  })

  // The layout a version 6 install actually holds. Nothing it named is LOST — every panel comes
  // back in the half it declares today — and two zones come back empty, the shelf having moved
  // to the left column. An emptied zone takes no room: one column fewer, not a blank rectangle.
  it('rebuilds a whole version 6 layout, losing no panel', () => {
    const open = openFrom({
      left: { primary: 'assets', secondary: 'explorer' },
      right: { primary: 'assets', secondary: 'inspector' },
      bottom: { primary: 'assets' },
    })

    // The shelf holds the upper left it was stored in: `??=` leaves the first claim standing.
    expect(open?.left).toEqual({ primary: 'assets', secondary: 'explorer' })
    expect(open?.right).toEqual({ secondary: 'inspector' })
    // The band it was stored in is the band's RIGHT half today, and it comes back empty.
    expect(open?.bottomRight).toEqual({})
  })

  // `documents`, `jobs` and `channels` were panels once; a bare id nobody ever knew is the same
  // case. Dropped where they stood, and the rest of the arrangement restored whole.
  it('drops a panel no version knows any more, and keeps the rest', () => {
    const open = openFrom({
      left: { primary: 'assets' },
      right: { primary: 'documents', secondary: 'inspector' },
      bottom: { primary: 'history', secondary: 'jobs' },
    })

    expect(open?.left).toEqual({ primary: 'assets' })
    // The half is emptied rather than dropped, the other one staying exactly as named.
    expect(open?.right).toEqual({ secondary: 'inspector' })
    expect(open?.bottomRight).toEqual({ primary: 'history' })
    expect(openFrom({ left: 'ghost' })).toEqual({ left: {} })
  })

  // The upper left was only left on its default; the shelf stored in the band claims it. An
  // explicit choice outranks a default, whichever of the two the rebuild reads first.
  it('lets a named panel win a half left on its default', () => {
    expect(openFrom({ left: { primary: null }, bottom: { primary: 'assets' } })).toEqual({
      left: { primary: 'assets' },
      bottomRight: {},
    })
  })

  it('keeps a default half that no panel claims', () => {
    expect(openFrom({ right: { primary: null, secondary: 'inspector' } })).toEqual({
      right: { primary: null, secondary: 'inspector' },
    })
  })

  it('never leaves a second half in a horizontal band — a band is never cut', () => {
    const stored = { bottom: { primary: 'timeline', secondary: 'explorer' } }
    expect(openFrom(stored)?.bottomRight?.secondary).toBeUndefined()
    // The explorer is not lost with the half it was stored in: it goes back to the column.
    expect(openFrom(stored)?.left?.secondary).toBe('explorer')
  })

  // Nothing to read is not an empty arrangement: the view is left out, and the chassis opens it
  // on the panels declared today. Answered with `{}`, every half would stay shut for good.
  it('reads nothing out of nothing, rather than an empty arrangement', () => {
    expect(migrateTools({}, 8).views.workspaces).toBeUndefined()
  })
})

describe('a layout stored before version 8', () => {
  // Every half named a panel up to version 7, the default included. Kept as a choice, an Image
  // nobody had ever arranged would still open on the explorer instead of its layers.
  it('keeps the halves and forgets the panels', () => {
    const migrated = migrateTools(
      {
        open: {
          right: { primary: 'explorer', secondary: 'inspector' },
          bottom: { primary: 'assets' },
        },
      },
      7,
    )

    // The band comes back with no half at all: the shelf it named moved to the left column, and
    // a zone emptied that way takes no room rather than standing blank.
    expect(migrated.views.workspaces).toEqual({
      left: { primary: null },
      right: { secondary: null },
      bottomRight: {},
    })
  })
})

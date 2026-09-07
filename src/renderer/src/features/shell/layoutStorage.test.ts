import { describe, expect, it } from 'vitest'
import { memoryStorage, readLayout, writeLayout, type LayoutStorage } from '@pasquelin/panels'
import type { ToolId } from '@shared/domain/tool'
import { LAYOUT_KEY, layoutStorageOn } from './layoutStorage'

/** What `zustand/persist` wrote under the key, envelope and all. */
function stored(state: unknown, version: number): [LayoutStorage, LayoutStorage] {
  const kept = memoryStorage()
  kept.write(LAYOUT_KEY, JSON.stringify({ state, version }))
  return [layoutStorageOn(kept), kept]
}

describe('the layout the chassis reads', () => {
  // The state a profile on the current build actually carries: both families arranged, the
  // lengths at the root. Nothing in it may be lost on the way to the chassis' own shape.
  it('carries a version 20 layout over whole', () => {
    const [storage] = stored(
      {
        arrangements: {
          workspaces: { open: { left: { primary: 'generator', secondary: null } } },
          home: { open: { left: { primary: 'projects' }, right: { primary: null } } },
        },
        lengths: { sizes: { left: 400 }, splits: { right: 180 }, bandSplit: 300 },
      },
      20,
    )

    expect(readLayout<ToolId>(storage, LAYOUT_KEY)).toEqual({
      views: {
        workspaces: { left: { primary: 'generator', secondary: null } },
        home: { left: { primary: 'projects' }, right: { primary: null } },
      },
      lengths: { sizes: { left: 400 }, splits: { right: 180 }, bandSplit: 300 },
    })
  })

  it('reads nothing out of an entry that is not the shape it claims', () => {
    const kept = memoryStorage()
    kept.write(LAYOUT_KEY, 'not json at all')
    expect(readLayout<ToolId>(layoutStorageOn(kept), LAYOUT_KEY)).toBeUndefined()

    kept.write(LAYOUT_KEY, JSON.stringify(['a', 'layout']))
    expect(readLayout<ToolId>(layoutStorageOn(kept), LAYOUT_KEY)).toBeUndefined()

    const [storage] = stored('gone', 20)
    expect(readLayout<ToolId>(storage, LAYOUT_KEY)).toBeUndefined()
  })

  it('reads nothing where nothing was ever written', () => {
    expect(layoutStorageOn(memoryStorage()).read(LAYOUT_KEY)).toBeNull()
  })

  // 🛑 The studio's own version 2 and the chassis' are both `2`. Told apart by the number, an
  // entry from that build reached `readLayout` as today's shape — every panel of it dropped.
  it('does not read the studio version 2 as the chassis version 2', () => {
    const [storage] = stored({ open: { right: 'inspector' } }, 2)

    expect(readLayout<ToolId>(storage, LAYOUT_KEY)?.views.workspaces).toEqual({
      right: { secondary: null },
    })
  })

  // What an upgrade actually looks like: the old entry is read once, then written over, under
  // the same key — and the chassis' own file is then handed straight back.
  it('replaces the entry it migrated from on the first write', () => {
    const [storage, kept] = stored(
      { arrangements: { workspaces: { open: { left: { primary: null } } } } },
      20,
    )
    const layout = {
      views: { workspaces: { right: { primary: 'layers' as ToolId } } },
      lengths: { sizes: { left: 400 }, splits: {} },
    }

    writeLayout(storage, LAYOUT_KEY, layout)

    expect(readLayout<ToolId>(storage, LAYOUT_KEY)).toEqual(layout)
    expect(JSON.parse(kept.read(LAYOUT_KEY) ?? 'null')).not.toHaveProperty('state')
  })
})

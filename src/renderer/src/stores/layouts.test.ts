import { beforeEach, describe, expect, it } from 'vitest'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { layoutShowing } from './layout-fixtures'
import { useLayouts } from './layouts'
import type { SerializedLayout } from './serializedLayout'

// The store never reads a layout back, it only stores and returns it — the marker is what
// tells two of them apart.
const layout = (marker: string): SerializedLayout => layoutShowing(marker)

describe('layouts store', () => {
  beforeEach(() => {
    localStorage.clear()
    useLayouts.setState({ activeWorkspace: 'image', home: false, layout: null })
  })

  it('remembers the arrangement of the centre', () => {
    useLayouts.getState().remember(layout('generator'))

    expect(useLayouts.getState().layout?.panels).toHaveProperty('generator')
  })

  // The centre holds every section's tabs at once, so choosing a section must not disturb it:
  // it changes the docks around the centre and nothing inside it.
  it('keeps the arrangement across a section switch', () => {
    const { remember, setActiveWorkspace } = useLayouts.getState()
    remember(layout('generator'))
    setActiveWorkspace('3d')
    setActiveWorkspace('image')

    const state = useLayouts.getState()
    expect(state.activeWorkspace).toBe('image')
    expect(state.layout?.panels).toHaveProperty('generator')
  })

  it('forgets the arrangement', () => {
    useLayouts.getState().remember(layout('generator'))
    useLayouts.getState().forget()

    expect(useLayouts.getState().layout).toBeNull()
  })

  // The centre announces the tab in front on every click, so choosing the section already up is
  // the common case and is guarded — but the guard must not swallow the other half of what
  // choosing a section does.
  it('still leaves the home when the section chosen is the one already up', () => {
    useLayouts.setState({ home: true })

    useLayouts.getState().setActiveWorkspace('image')

    expect(useLayouts.getState().home).toBe(false)
  })

  describe('prune', () => {
    it('takes the panel out of the arrangement', () => {
      useLayouts.getState().remember(layoutShowing('kept', 'ghost'))

      useLayouts.getState().prune(new Set(['ghost']))

      expect(Object.keys(useLayouts.getState().layout?.panels ?? {})).toEqual(['kept'])
    })

    it('forgets an arrangement left with no panel rather than storing an empty one', () => {
      useLayouts.getState().remember(layoutShowing('ghost'))

      useLayouts.getState().prune(new Set(['ghost']))

      expect(useLayouts.getState().layout).toBeNull()
    })

    // Every launch calls this, and a layout replaced by an equal one is a write to
    // `localStorage` for nothing — and a new identity for whoever subscribes to it.
    it('leaves the arrangement alone when it shows none of them', () => {
      useLayouts.getState().remember(layoutShowing('kept'))
      const before = useLayouts.getState().layout

      useLayouts.getState().prune(new Set(['elsewhere']))

      expect(useLayouts.getState().layout).toBe(before)
    })
  })

  // Only Dockview can read a layout back, so a build whose Dockview — or whose set of document
  // kinds — has moved on cannot tell whether a stored one still loads. It throws on restore if
  // it does not, which is why the stamp exists rather than a migration.
  describe('persisted format', () => {
    it('drops what an older build stored instead of handing it to Dockview', async () => {
      localStorage.setItem(
        'ai-desktop-studio:layouts',
        JSON.stringify({
          state: { activeWorkspace: 'image', layouts: { image: layout('generator') } },
          version: 0,
        }),
      )

      await useLayouts.persist.rehydrate()

      expect(useLayouts.getState().layout).toBeNull()
    })

    /**
     * The six layouts became one, and the map an older build wrote is not a layout: handed to
     * `fromJSON` it throws, and the throw happens inside Dockview's own mount effect — which
     * took the window down rather than losing an arrangement.
     */
    it('drops the per-section layouts a build before the unified centre stored', async () => {
      localStorage.setItem(
        'ai-desktop-studio:layouts',
        JSON.stringify({
          state: { activeWorkspace: 'image', layouts: { image: layout('generator') } },
          version: 2,
        }),
      )

      await useLayouts.persist.rehydrate()

      expect(useLayouts.getState().layout).toBeNull()
    })

    /**
     * `activeWorkspace` is persisted too, and it outlives the space it names. A session last
     * left in a workspace this build no longer declares restored it verbatim, and the first
     * reader to ask `workspaceById` for it threw `Unknown workspace` — during render, in the
     * shell, the generator and the models panel alike. The version stamp is what drops it.
     */
    it('drops a workspace this build no longer declares, rather than restoring it', async () => {
      localStorage.setItem(
        'ai-desktop-studio:layouts',
        JSON.stringify({ state: { activeWorkspace: 'graph', layout: null }, version: 1 }),
      )

      await useLayouts.persist.rehydrate()

      expect(WORKSPACE_IDS).toContain(useLayouts.getState().activeWorkspace)
    })
  })

  describe('adopt', () => {
    // A panel is a document open, and the documents live in the project folder: kept across a
    // change of project, the tabs of the previous one come back over a folder that has none.
    it('drops the arrangement of the project being left', () => {
      useLayouts.getState().adopt('/projects/first')
      useLayouts.getState().remember(layout('generator'))

      useLayouts.getState().adopt('/projects/second')

      expect(useLayouts.getState().layout).toBeNull()
      expect(useLayouts.getState().projectPath).toBe('/projects/second')
    })

    // The main process reopens the last project on launch: taking that for a change of project
    // would greet the user with an empty centre every single time.
    it('keeps the arrangement when the same project comes back', () => {
      useLayouts.getState().adopt('/projects/first')
      useLayouts.getState().remember(layout('generator'))

      useLayouts.getState().adopt('/projects/first')

      expect(useLayouts.getState().layout?.panels).toHaveProperty('generator')
    })

    it('drops the arrangement when no project is open any more', () => {
      useLayouts.getState().adopt('/projects/first')
      useLayouts.getState().remember(layout('generator'))

      useLayouts.getState().adopt(null)

      expect(useLayouts.getState().layout).toBeNull()
    })
  })
})

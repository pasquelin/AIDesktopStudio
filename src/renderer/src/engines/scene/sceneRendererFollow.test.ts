import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * The view that travels with what it was aimed at — Unity's ⇧F.
 *
 * Read as text for the reason `sceneRendererFlight.test.ts` gives: the engine cannot be built
 * without a WebGL context. What is held here is the three things that make a follow either
 * harmless or ruinous — that it lets go, that it moves BOTH ends, and that it sleeps.
 */
describe('SceneRenderer and the selection it follows', () => {
  const method = (signature: string): string =>
    source.match(new RegExp(`${signature} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''

  const frameFollow = method('frameFollow\\(\\): void')
  const follow = method('protected followSelection\\(\\): boolean')
  const applyEntry = method('apply\\(state: SceneState\\): void')
  const runtimeEntry = method(
    'applyRuntimeTransforms\\(placements: readonly RuntimePlacement\\[\\]\\): boolean',
  )
  const apply = method(
    'private applyState\\(state: SceneState, changed: readonly SceneNode\\[\\] \\| null\\): void',
  )
  // The half of the pass that reads the document's selection — `applyState` calls it.
  const select = method('private rehangAndSelect\\(state: SceneState\\): void')

  // A regex that matched nothing would make every assertion below vacuously true.
  it('finds the paths and both application entries the rest of this file reads', () => {
    expect(
      [frameFollow, follow, apply, select, applyEntry, runtimeEntry].every(
        found => found.length > 0,
      ),
    ).toBe(true)
    expect(applyEntry).toContain('this.applyState(state, null)')
    expect(runtimeEntry).toContain('this.applyState(delta.state, delta.changed)')
    expect(apply).toContain('this.rehangAndSelect(state)')
  })

  /** The same press that took hold lets go, as `scene.isolate` already does. */
  it('lets go when called a second time, and frames nothing on the way out', () => {
    expect(frameFollow.indexOf('this.followed = null')).toBeLessThan(
      frameFollow.indexOf('this.frameSelection()'),
    )
  })

  it('takes hold on the centre it just framed', () => {
    expect(frameFollow).toContain('this.followed = this.selectionCentre()')
  })

  /**
   * 🛑 Measured in the app on 2026-09-03: a frame drawn while the graph is being rebuilt reads no
   * object for a node that is still selected, and letting go there dropped the follow at the
   * first move — the very thing it exists for. The DOCUMENT says when there is nothing left.
   */
  it('lets go on an emptied selection, and never on a frame that read nothing', () => {
    expect(select).toContain('if (state.selectedIds.length === 0) this.followed = null')
    expect(follow).toContain('if (!centre) return false')
    expect(follow).not.toContain('this.followed = null')
  })

  /**
   * BOTH, by the same amount: moving the camera alone turns the view as it goes, and moving the
   * pivot alone leaves the camera looking past what it follows.
   */
  it('carries the camera and the pivot together', () => {
    expect(follow).toContain('this.viewport.camera.position.add(shift)')
    expect(follow).toContain('orbit.target.add(shift)')
  })

  /**
   * 🛑 Picking another body ten metres away left the old centre in place, and the next frame
   * added the whole distance between the two to the camera in one go — a bare click teleported
   * the view. A new selection is a new thing to follow, seated where the hand left the view.
   */
  it('seats itself afresh on a selection that changed, rather than leaping to it', () => {
    expect(follow).toContain('if (this.selectedIds !== this.followedIds)')
    expect(follow.indexOf('this.followedIds = this.selectedIds')).toBeLessThan(
      follow.indexOf('const shift = centre.sub(held)'),
    )
  })

  /**
   * `advance` keeps the render loop awake for as long as anything answers true. Answering it on
   * every frame would burn a GPU on a scene where nothing at all is moving.
   */
  it('answers false while what it follows has not moved', () => {
    expect(follow).toContain('if (shift.lengthSq() === 0) return false')
  })
})

import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * What the surface snap aims at, read as text.
 *
 * The engine cannot be built without a WebGL context — `sceneRendererRedraw.test.ts` gives the
 * reason — so the method that lays a drag down has no other witness. The pure halves it calls are
 * tested for themselves in `surfaceSnap.test.ts`; what is left, and what went wrong, is WHICH
 * object it reads.
 */
describe('SceneRenderer and what a surface snap lays down', () => {
  const layOnSurface =
    source.match(/protected layOnSurface\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

  it('has a method to read at all, so the rules below cannot pass on an empty string', () => {
    expect(layOnSurface).toContain('snapSurfaceOffset')
  })

  /**
   * The defect this guard exists for: it read `this.pivot`, which `gizmoTargetFor` fills only
   * from TWO selected nodes upward — a lone selection attaches straight to its object. So the
   * snap did nothing at all on one object, every frame, without a word. Nothing was red.
   */
  it('moves what the gizmo holds, never the pivot', () => {
    expect(layOnSurface).toContain('this.gizmo?.object')
    expect(layOnSurface).not.toContain('this.pivot')
  })

  /**
   * A ray that took the first thing it met landed on the dragged object's own child, on hidden
   * geometry, on a rail — `landsOn` is what refuses all three, and dropping it would put every
   * one of them back.
   */
  it('weighs what the ray met rather than taking the first hit', () => {
    expect(layOnSurface).toContain('this.landsOn(')
    expect(layOnSurface).not.toMatch(/intersectObjects\([\s\S]*?\)\[0\]/)
  })
})

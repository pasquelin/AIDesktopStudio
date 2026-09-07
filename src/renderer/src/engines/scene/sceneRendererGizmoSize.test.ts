import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { boundsOf } from '@shared/domain/settingsRegistry'

/**
 * That the handle size reaches the gizmo at all, read as text: the engine needs a WebGL context
 * to exist, so `sceneRendererRedraw.test.ts` gives the reason this shape of guard is the one
 * available here.
 */
describe('SceneRenderer and the size of its handles', () => {
  it('gives the gizmo a size CAPPED to what it holds, never the setting raw', () => {
    expect(source).toContain('this.gizmo.size = gizmoSizeFor(')
    expect(source).not.toContain('this.gizmo.size = this.view.gizmoSize')
  })

  /**
   * Three CALLS — the fourth occurrence is the declaration. On build, so a gizmo rebuilt after a
   * detach does not come back at the library's default; on `configure`, so a preference is seen
   * without waiting for the next selection; and on every FRAME, because the cap reads the
   * distance and the distance moves on every notch of the wheel.
   */
  it('applies it on build, on configure AND on every frame', () => {
    expect(source.match(/this\.applyGizmoSize\(\)/g)).toHaveLength(3)
  })
})

describe('what the handle size is allowed to be', () => {
  // Three quarters of what the object measures: the handles read as belonging to it without
  // tracing its outline, which is what wrapping it exactly ended up looking like.
  it('opens at three quarters of what it holds', () => {
    expect(DEFAULT_SETTINGS.three.gizmoSize).toBe(0.75)
  })

  /**
   * The studio opens at the bottom of the range — handles that wrap the object exactly — and the
   * range reaches TWICE that: a small part is easier to work on with the handles standing clear
   * of its outline than hugging it. The library's own default of 1 sits inside either way.
   */
  it('opens at the floor of a range that reaches twice the object', () => {
    const { min, max } = boundsOf('three.gizmoSize')

    expect(min).toBe(DEFAULT_SETTINGS.three.gizmoSize)
    expect(max).toBe(2)
  })
})

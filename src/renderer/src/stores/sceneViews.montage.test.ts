import { describe, expect, it } from 'vitest'
import { sceneViewAffectsMontage, sceneViewsAffectMontage } from './sceneViewChrome'
import { sceneViewOf, useSceneViews } from './sceneViews'

describe('what a montage redraws for', () => {
  it('ignores a playhead that moved and nothing else', () => {
    const before = useSceneViews.getState()
    before.setPlayhead('scene-1', 1_000_000)
    const after = useSceneViews.getState()

    expect(sceneViewsAffectMontage(before, after)).toBe(false)
    expect(
      sceneViewAffectsMontage(sceneViewOf(before, 'scene-1'), sceneViewOf(after, 'scene-1')),
    ).toBe(false)
  })

  it('redraws when the framing a montage looks through has moved', () => {
    const before = useSceneViews.getState()
    before.setCamera('scene-1', {
      position: { x: 0, y: 1, z: 2 },
      target: { x: 0, y: 0, z: 0 },
    })
    const after = useSceneViews.getState()

    expect(sceneViewsAffectMontage(before, after)).toBe(true)
  })
})

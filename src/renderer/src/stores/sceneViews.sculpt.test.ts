import { describe, expect, it } from 'vitest'
import { SCULPT_AMOUNT } from '@/engines/scene/reliefStroke'
import { sceneViewOf, useSceneViews } from './sceneViews'

describe('sculpt and pose as exclusive sessions', () => {
  it('drops pose when sculpt is armed', () => {
    useSceneViews.setState({ views: {} })
    useSceneViews.getState().setPoseMode('doc-1', true)
    useSceneViews.getState().setSculptMode('doc-1', true)

    const view = sceneViewOf(useSceneViews.getState(), 'doc-1')
    expect(view.sculptMode).toBe(true)
    expect(view.poseMode).toBe(false)
    expect(view.pickedBone).toBeNull()
  })

  it('drops sculpt when pose is armed', () => {
    useSceneViews.setState({ views: {} })
    useSceneViews.getState().setSculptMode('doc-1', true)
    useSceneViews.getState().setPoseMode('doc-1', true)

    const view = sceneViewOf(useSceneViews.getState(), 'doc-1')
    expect(view.poseMode).toBe(true)
    expect(view.sculptMode).toBe(false)
  })

  it('holds the active disk tool on the session', () => {
    useSceneViews.setState({ views: {} })
    useSceneViews.getState().setSculptTool('doc-1', 'smooth')

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').sculptTool).toBe('smooth')
  })

  it('holds brush radius, falloff and amount on the session, not the document', () => {
    useSceneViews.setState({ views: {} })
    useSceneViews.getState().setSculptRadius('doc-1', 8)
    useSceneViews.getState().setSculptFalloff('doc-1', 0.4)
    useSceneViews.getState().setSculptAmount('doc-1', 0.3)

    const view = sceneViewOf(useSceneViews.getState(), 'doc-1')
    expect(view.sculptRadius).toBe(8)
    expect(view.sculptFalloff).toBe(0.4)
    expect(view.sculptAmount).toBe(0.3)
  })

  it('opens the amount at the historical dab raise, so a first stroke matches the old constant', () => {
    useSceneViews.setState({ views: {} })
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').sculptAmount).toBe(SCULPT_AMOUNT)
    expect(SCULPT_AMOUNT).toBe(0.1)
  })
})

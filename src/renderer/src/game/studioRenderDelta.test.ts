import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { drawnBy } from './game-fixtures'
import { createStudioRender, type SceneDraw } from './studioRender'

const raised = (y: number) => ({ ...IDENTITY_TRANSFORM, position: { x: 0, y, z: 0 } })

function drawingDelta(state: SceneState, accepted: boolean) {
  const apply = vi.fn()
  const applyRuntimeTransforms = vi.fn<NonNullable<SceneDraw['applyRuntimeTransforms']>>(
    () => accepted,
  )
  const render = createStudioRender(drawnBy({ apply, applyRuntimeTransforms }), () => state)
  render.place([{ entity: 'a', transform: raised(1) }])
  apply.mockClear()
  return { apply, applyRuntimeTransforms, render }
}

describe('incremental studio placements', () => {
  it('hands only changed nodes to the incremental renderer after the initial document apply', () => {
    const state = { ...EMPTY_SCENE, nodes: [meshNode('a'), meshNode('b')] }
    const { apply, applyRuntimeTransforms, render } = drawingDelta(state, true)

    render.place([{ entity: 'a', transform: raised(2) }])
    render.place([{ entity: 'a', transform: raised(2) }])

    expect(apply).not.toHaveBeenCalled()
    expect(applyRuntimeTransforms).toHaveBeenCalledTimes(1)
    expect(applyRuntimeTransforms.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: 'a', transform: raised(2) }),
    ])
    expect(state.nodes[0]?.transform).toEqual(IDENTITY_TRANSFORM)
  })

  it('falls back to a complete state when a delta cannot be applied', () => {
    const state = { ...EMPTY_SCENE, nodes: [meshNode('a')] }
    const { apply, applyRuntimeTransforms, render } = drawingDelta(state, false)

    render.place([{ entity: 'a', transform: raised(2) }])

    expect(applyRuntimeTransforms).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith({
      ...state,
      nodes: [{ ...state.nodes[0], transform: raised(2) }],
    })
  })
})

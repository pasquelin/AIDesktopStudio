import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { drawnBy } from './game-fixtures'
import { createStudioRender } from './studioRender'

const scene = (): SceneState => ({ ...EMPTY_SCENE, nodes: [meshNode('a'), meshNode('b')] })

const raised = { ...IDENTITY_TRANSFORM, position: { x: 0, y: 3, z: 0 } }

function drawing(state: SceneState = scene()) {
  const apply = vi.fn()
  const placeView = vi.fn()
  return {
    apply,
    placeView,
    render: createStudioRender(drawnBy({ apply, placeView }), () => state),
    state,
  }
}

describe('what draws a running game inside the studio', () => {
  /** Two shots that differ by the lens alone are two shots: the viewport must see the second. */
  it('hands the viewport the lens a shot carries, and a lens moved on its own', () => {
    const { placeView, render } = drawing()
    const shot = { position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } }

    render.view({ ...shot, fieldOfView: 35 })
    render.view({ ...shot, fieldOfView: 35 })
    render.view(shot)

    expect(placeView).toHaveBeenCalledTimes(2)
    expect(placeView.mock.calls[0]?.[0]).toMatchObject({ fieldOfView: 35 })
    expect(placeView.mock.calls[1]?.[0]?.fieldOfView).toBeUndefined()
  })

  it('redraws the scene with the object where the step put it', () => {
    const { apply, render, state } = drawing()

    render.place([{ entity: 'a', transform: raised }])

    const drawn: SceneState = apply.mock.calls[0]?.[0]
    expect(drawn.nodes[0]?.transform.position.y).toBe(3)
    // 🛑 The one that did not move is the SAME object: `apply` skips a node it already applied,
    // which is what keeps a frame to the cost of what actually moved.
    expect(drawn.nodes[1]).toBe(state.nodes[1])
  })

  it('draws nothing at all while nothing moves', () => {
    const { apply, render } = drawing()

    render.place([{ entity: 'a', transform: IDENTITY_TRANSFORM }])
    render.place([])

    expect(apply).not.toHaveBeenCalled()
  })

  it('draws once when a moved object stops moving', () => {
    const { apply, render } = drawing()

    render.place([{ entity: 'a', transform: raised }])
    render.place([{ entity: 'a', transform: raised }])

    expect(apply).toHaveBeenCalledTimes(1)
  })

  /** The document may be edited while a game runs: the shadow rebases rather than going stale. */
  it('forgets where it had put things when the document itself changed', () => {
    let state = scene()
    const apply = vi.fn()
    const render = createStudioRender(drawnBy({ apply }), () => state)

    render.place([{ entity: 'a', transform: raised }])
    state = scene()
    render.place([{ entity: 'a', transform: raised }])

    expect(apply).toHaveBeenCalledTimes(2)
  })

  it('says nothing about an object the document has not got', () => {
    const { apply, render } = drawing()

    render.place([{ entity: 'gone', transform: raised }])

    expect(apply).not.toHaveBeenCalled()
  })

  it('redraws the baked slot addressed by its source identity', () => {
    const baked = {
      ...meshNode('baked'),
      instances: [
        { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
        { sourceId: 'second', name: 'Second', transform: IDENTITY_TRANSFORM },
      ],
    }
    const { apply, render } = drawing({ ...EMPTY_SCENE, nodes: [baked] })

    render.place([{ entity: 'second', transform: raised }])

    const drawn: SceneState = apply.mock.calls[0]?.[0]
    const node = drawn.nodes[0]
    expect(node?.type === 'mesh' ? node.instances?.[1]?.transform : null).toEqual(raised)
  })
})

/**
 * The viewport re-applies the document on any change — a click on a node is one, the selection
 * being part of the state — and it applies it OVER what the game had drawn. A paused game does
 * not move, so without a repaint here everything snaps back to the authored pose and stays there.
 */
describe('a game whose document changed under it', () => {
  it('puts back where it had drawn, on the nodes the document now holds', () => {
    let state = scene()
    const apply = vi.fn()
    const render = createStudioRender(drawnBy({ apply }), () => state)

    render.place([{ entity: 'a', transform: raised }])
    apply.mockClear()

    state = { ...scene(), nodes: [{ ...meshNode('a'), name: 'Renamed' }, meshNode('b')] }
    render.place([{ entity: 'a', transform: raised }])

    const drawn: SceneState = apply.mock.calls[0]?.[0]
    expect(drawn.nodes[0]?.name).toBe('Renamed')
    expect(drawn.nodes[0]?.transform.position.y).toBe(3)
  })

  it('forgets an object the document no longer holds', () => {
    let state = scene()
    const apply = vi.fn()
    const render = createStudioRender(drawnBy({ apply }), () => state)

    render.place([{ entity: 'a', transform: raised }])
    apply.mockClear()

    state = { ...scene(), nodes: [meshNode('b')] }
    render.place([])

    expect(apply).not.toHaveBeenCalled()
  })
})

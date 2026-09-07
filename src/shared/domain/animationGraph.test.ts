import { describe, expect, it } from 'vitest'
import { ANIMATION_GRAPH_VERSION, animationGraphOf } from './animationGraph'

const walking = {
  version: ANIMATION_GRAPH_VERSION,
  id: 'character',
  parameters: [{ id: 'armed', kind: 'boolean' }],
  layers: [
    {
      id: 'base',
      initial: 'idle',
      states: [
        { id: 'idle', source: { kind: 'bundled', name: 'Idle' } },
        {
          id: 'walk',
          source: { kind: 'bundled', name: 'Walk' },
          speedFrom: 'speed',
          events: [{ id: 'left', at: 0.25, name: 'footstep' }],
        },
        { id: 'jump', source: { kind: 'bundled', name: 'Jump' }, loop: false },
      ],
      transitions: [
        { from: 'idle', to: 'walk', fade: 0.15, when: [{ param: 'speed', op: '>', value: 0.1 }] },
        { to: 'jump', fade: 0.08, when: [{ param: 'jumped', op: '==', value: true }] },
        { from: 'jump', to: 'idle', exitTime: 0.9 },
      ],
    },
  ],
}

const refused = (change: Record<string, unknown>): (() => unknown) =>
  function () {
    return animationGraphOf({ ...walking, ...change })
  }

describe('reading an animation graph', () => {
  it('preserves the selected clip and refuses a negative selection', () => {
    const source = { kind: 'asset', name: 'Multi', assetId: 'a', clipIndex: 2 }
    const layer = { id: 'base', initial: 'idle', states: [{ id: 'idle', source }], transitions: [] }
    expect(animationGraphOf({ ...walking, layers: [layer] }).layers[0]?.states[0]?.source).toEqual(
      source,
    )
    expect(() =>
      animationGraphOf({
        ...walking,
        layers: [{ ...layer, states: [{ id: 'idle', source: { ...source, clipIndex: -1 } }] }],
      }),
    ).toThrow('clip index')
  })

  it('fills what a state leaves unsaid', () => {
    const graph = animationGraphOf(walking)
    const [idle] = graph.layers[0]?.states ?? []

    expect(idle?.loop).toBe(true)
    expect(idle?.speed).toBe(1)
    // The controller walks the body; a clip free to travel would move it a second time.
    expect(idle?.rootMotion).toBe('inPlace')
    expect(graph.layers[0]?.part).toBe('all')
  })

  it('keeps a transition out of any state as an empty from', () => {
    const graph = animationGraphOf(walking)

    expect(graph.layers[0]?.transitions[1]?.from).toBe('')
  })

  it('refuses a version it does not know', () => {
    expect(refused({ version: 99 })).toThrow('unsupported animation graph version')
  })

  it('refuses a parameter that takes a built-in name', () => {
    expect(refused({ parameters: [{ id: 'speed', kind: 'number' }] })).toThrow('built-in')
  })

  it('refuses a condition on a parameter nobody declared', () => {
    const layer = {
      ...walking.layers[0],
      transitions: [{ from: 'idle', to: 'walk', when: [{ param: 'stamina', op: '>', value: 1 }] }],
    }

    expect(refused({ layers: [layer] })).toThrow('unknown animation parameter stamina')
  })

  it('refuses an ordering on a switch', () => {
    const layer = {
      ...walking.layers[0],
      transitions: [
        { from: 'idle', to: 'walk', when: [{ param: 'grounded', op: '>', value: true }] },
      ],
    }

    expect(refused({ layers: [layer] })).toThrow('compares by == or !=')
  })

  it('refuses a way out that neither waits nor asks anything', () => {
    const layer = { ...walking.layers[0], transitions: [{ from: 'idle', to: 'walk' }] }

    expect(refused({ layers: [layer] })).toThrow('needs a condition or an exitTime')
  })

  it('refuses an opening state the layer does not hold', () => {
    const layer = { ...walking.layers[0], initial: 'sprint' }

    expect(refused({ layers: [layer] })).toThrow('opens on one of its own states')
  })

  it('refuses a second layer rather than playing half the file', () => {
    expect(refused({ layers: [walking.layers[0], walking.layers[0]] })).toThrow('exactly one layer')
  })
})

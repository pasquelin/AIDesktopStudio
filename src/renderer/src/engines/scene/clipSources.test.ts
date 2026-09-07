import { describe, expect, it } from 'vitest'
import { ANIMATION_GRAPH_VERSION, type AnimationGraph } from '@shared/domain/animationGraph'
import { bundledAnimationUrl } from '@shared/domain/animationLibrary'
import type { AnimationState } from '@shared/domain/animationGraph'
import type { ClipSource } from '@shared/domain/sceneModel'
import { graphClipsOf, graphSourcesOf } from './clipSources'

const state = (id: string, name: string, source?: ClipSource): AnimationState => ({
  id,
  source: source ?? { kind: 'bundled', name },
  loop: true,
  speed: 1,
  rootMotion: 'inPlace',
})

const graph: AnimationGraph = {
  version: ANIMATION_GRAPH_VERSION,
  id: 'character',
  parameters: [],
  layers: [
    {
      id: 'base',
      part: 'all',
      initial: 'idle',
      states: [state('idle', 'Idle'), state('walk', 'Walk'), state('stand', 'Idle')],
      transitions: [],
    },
  ],
}

describe('the clips a state machine names', () => {
  /** Once per KEY: two states on the same shipped folder are one file to read. */
  it('lists each file once, whatever how many states play it', () => {
    expect(graphSourcesOf(graph).map(one => one.name)).toEqual(['Idle', 'Walk'])
  })

  it('says where each one is read from, and what to call it', () => {
    expect(graphClipsOf(graph)).toEqual([
      { key: 'bundled:Idle', url: bundledAnimationUrl('Idle'), label: 'Idle' },
      { key: 'bundled:Walk', url: bundledAnimationUrl('Walk'), label: 'Walk' },
    ])
  })

  it('leaves out what the model brought itself, which needs no reading at all', () => {
    const layer = graph.layers[0]
    if (!layer) throw new Error('a graph always holds its layer')
    const brought = state('idle', 'Idle', { kind: 'embedded', name: 'Idle' })
    const own: AnimationGraph = { ...graph, layers: [{ ...layer, states: [brought] }] }

    expect(graphSourcesOf(own)).toHaveLength(1)
    expect(graphClipsOf(own)).toEqual([])
  })
})

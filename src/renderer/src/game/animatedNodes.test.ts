import { describe, expect, it } from 'vitest'
import { ANIMATION_GRAPH_VERSION, type AnimationGraph } from '@shared/domain/animationGraph'
import { animationGraphPreset } from '@shared/domain/animationPresets'
import type { SceneNode } from '@/engines/scene/sceneState'
import { animatedNodesOf, graphNamed, graphsHeldForExport } from './animatedNodes'

const OWN: AnimationGraph = {
  version: ANIMATION_GRAPH_VERSION,
  id: 'wander',
  parameters: [],
  layers: [
    {
      id: 'base',
      part: 'all',
      initial: 'idle',
      states: [
        {
          id: 'idle',
          source: { kind: 'bundled', name: 'Idle' },
          loop: true,
          speed: 1,
          rootMotion: 'inPlace',
        },
      ],
      transitions: [],
    },
  ],
}

const node = (id: string, graph?: string): SceneNode =>
  ({
    id,
    name: id,
    type: 'group',
    ...(graph === undefined ? {} : { components: [{ type: 'Animator', graph, body: '' }] }),
  }) as unknown as SceneNode

describe('which graph a node plays', () => {
  const named = graphNamed([{ path: 'Motions/wander.anim.json', graph: OWN }])

  it('plays the shipped one when the component names nothing', () => {
    expect(named('')).toEqual(animationGraphPreset('character'))
  })

  it('plays the file the component names', () => {
    expect(named('Motions/wander.anim.json')).toBe(OWN)
  })

  /**
   * 🛑 The reason this resolution is ONE function: written twice, the two answered differently
   * here, and the studio preloaded the clips of one graph while the world played another.
   */
  it('answers nothing for a name no file wears', () => {
    expect(named('Motions/typo.anim.json')).toBeNull()
  })
})

describe('the nodes of a scene a state machine animates', () => {
  const named = graphNamed([{ path: 'Motions/wander.anim.json', graph: OWN }])

  it('finds the ones carrying an animator, and what each plays', () => {
    const found = animatedNodesOf(
      [node('capsule'), node('hero', ''), node('crowd', 'Motions/wander.anim.json')],
      named,
    )

    expect(found.map(one => one.nodeId)).toEqual(['hero', 'crowd'])
    expect(found[1]?.graph).toBe(OWN)
  })

  it('leaves out a node whose graph no file answers', () => {
    expect(animatedNodesOf([node('hero', 'Motions/typo.anim.json')], named)).toEqual([])
  })
})

describe('the graphs a standalone game has to carry', () => {
  it('files the shipped preset under the empty name when a node still plays it', () => {
    const held = graphsHeldForExport([node('hero', '')], [])

    expect(held).toHaveLength(1)
    expect(held[0]?.path).toBe('')
    expect(held[0]?.graph).toEqual(animationGraphPreset('character'))
  })

  it('leaves a project graph that already occupies the empty name alone', () => {
    const own = { path: '', graph: OWN }
    expect(graphsHeldForExport([node('hero', '')], [own])).toEqual([own])
  })

  it('adds nothing when nobody plays the shipped preset', () => {
    expect(graphsHeldForExport([node('crowd', 'Motions/wander.anim.json')], [])).toEqual([])
  })
})

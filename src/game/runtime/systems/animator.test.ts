// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { ANIMATION_GRAPH_VERSION, animationGraphOf } from '@shared/domain/animationGraph'
import type { PosedClip } from '../../ports/animationPort'
import { createAnimators } from '../animators'
import { createCharacters, type Characters, type WalkerReading } from '../characters'
import { createIntents } from '../intents'
import { createPossessions } from '../possessions'
import { testPorts, testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createAnimatorSystem } from './animator'

const GRAPH = animationGraphOf({
  version: ANIMATION_GRAPH_VERSION,
  id: 'character',
  parameters: [{ id: 'armed', kind: 'boolean' }],
  layers: [
    {
      id: 'base',
      initial: 'idle',
      states: [
        { id: 'idle', source: { kind: 'bundled', name: 'Idle' } },
        { id: 'walk', source: { kind: 'bundled', name: 'Walk' } },
      ],
      transitions: [
        {
          to: 'walk',
          when: [
            { param: 'grounded', op: '==', value: true },
            { param: 'speed', op: '>', value: 0.1 },
          ],
        },
        { to: 'idle', when: [{ param: 'speed', op: '<=', value: 0.1 }] },
      ],
    },
  ],
})

const LENGTHS = { 'bundled:Idle': 4, 'bundled:Walk': 1 }

/** A walker that says whatever the case asks it to, so the system is driven without physics. */
function saying(reading: WalkerReading): Characters {
  const real = createCharacters(createPossessions(), entity => entity.transform, createIntents())
  return { ...real, reading: () => reading }
}

const still: WalkerReading = {
  speed: 0,
  forward: 0,
  strafe: 0,
  grounded: true,
  velocityY: 0,
  facing: 0,
}

function running(reading: WalkerReading) {
  const animators = createAnimators()
  const posed: { entity: string; clips: readonly PosedClip[] }[] = []
  const world = testWorld({
    ports: testPorts({
      animation: {
        pose: (entity, clips) => void posed.push({ entity, clips }),
        release: () => {},
        releaseAll: () => {},
        lengths: () => LENGTHS,
      },
    }),
    systems: [
      createAnimatorSystem({ graphOf: () => GRAPH, characters: saying(reading), animators }),
    ],
  })
  const hero = world.spawn({ name: 'Hero', components: [{ type: 'Animator', graph: '' }] })
  return { world, animators, posed, hero: hero.id }
}

const stepped = (world: World, times: number): void => {
  for (let index = 0; index < times; index += 1) world.step(1 / 60)
}

describe('what the animator plays a body', () => {
  it('walks a body that is moving, and stands one that is not', () => {
    const walking = running({ ...still, speed: 2 })
    stepped(walking.world, 3)
    expect(walking.animators.playingOn(walking.hero)?.state).toBe('walk')

    const standing = running(still)
    stepped(standing.world, 3)
    expect(standing.animators.playingOn(standing.hero)?.state).toBe('idle')
  })

  it('poses the clip of the state it plays, on the frame', () => {
    const { world, posed } = running({ ...still, speed: 2 })
    stepped(world, 3)
    world.lateUpdate(1, 1 / 60)

    expect(posed.at(-1)?.clips.map(clip => clip.key)).toContain('bundled:Walk')
  })

  /**
   * 🛑 A script may drive a parameter of its own; it may not lie about what the body IS doing.
   * `set('grounded', false)` never lapses, and would lock a character out of every way back.
   */
  it('lets no written parameter overwrite what the body is doing', () => {
    const { world, animators, hero } = running({ ...still, speed: 2 })
    animators.set(hero, 'grounded', false)
    animators.set(hero, 'armed', true)
    stepped(world, 3)

    expect(animators.playingOn(hero)?.state).toBe('walk')
  })

  it('drops what a body held once it is destroyed', () => {
    const { world, animators, hero } = running({ ...still, speed: 2 })
    animators.set(hero, 'armed', true)
    stepped(world, 2)

    world.destroy(hero)
    stepped(world, 2)

    expect(animators.writtenOn(hero)).toEqual({})
    expect(animators.playingOn(hero)).toBeNull()
  })
})

// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import {
  ANIMATION_GRAPH_VERSION,
  animationGraphOf,
  type AnimationLayer,
} from '@shared/domain/animationGraph'
import { animationGraphPreset } from '@shared/domain/animationPresets'
import type { PosedClip } from '../ports/animationPort'
import {
  CLIP_SPEED,
  clipKeyOf as studioClipKeyOf,
  type ClipSource,
} from '@shared/domain/sceneModel'
import type { AnimationCondition } from '@shared/domain/animationGraph'
import {
  advanceAnimator,
  clipKeyOf,
  conditionHolds,
  MAX_RATE,
  freshAnimator,
  posedClipsOf,
  type AnimatorState,
  type ParameterReading,
} from './animationMachine'

const STEP = 1 / 60

const LENGTHS = { 'bundled:Idle': 4, 'bundled:Walk': 1, 'bundled:Jump': 2 }

function layerOf(written: Record<string, unknown>): AnimationLayer {
  const graph = animationGraphOf({
    version: ANIMATION_GRAPH_VERSION,
    id: 'character',
    parameters: [],
    layers: [{ id: 'base', initial: 'idle', ...written }],
  })
  const layer = graph.layers[0]
  if (!layer) throw new Error('a graph always holds its layer')
  return layer
}

const WALKING = layerOf({
  states: [
    { id: 'idle', source: { kind: 'bundled', name: 'Idle' } },
    { id: 'walk', source: { kind: 'bundled', name: 'Walk' }, speedFrom: 'speed' },
    {
      id: 'jump',
      source: { kind: 'bundled', name: 'Jump' },
      loop: false,
      events: [{ id: 'lift', at: 0.5, name: 'liftOff' }],
    },
  ],
  transitions: [
    { from: 'idle', to: 'walk', fade: 0.2, when: [{ param: 'speed', op: '>', value: 0.1 }] },
    { from: 'walk', to: 'idle', fade: 0.2, when: [{ param: 'speed', op: '<=', value: 0.1 }] },
    { to: 'jump', fade: 0, when: [{ param: 'jumped', op: '==', value: true }] },
    { from: 'jump', to: 'idle', exitTime: 1 },
  ],
})

/** The machine run for a while against one reading, which is how every case below opens. */
function ran(
  layer: AnimationLayer,
  held: AnimatorState,
  reading: ParameterReading,
  steps: number,
  asked?: { forced?: string; letGo?: boolean },
  lengths: Readonly<Record<string, number>> = LENGTHS,
): { held: AnimatorState; happened: string[] } {
  let current = held
  const happened: string[] = []
  for (let index = 0; index < steps; index += 1) {
    // Asked on the FIRST step only: a script calls `play` once, not sixty times a second.
    const step = advanceAnimator(layer, current, reading, lengths, STEP, index === 0 ? asked : {})
    current = step.next
    for (const one of step.happened)
      happened.push(one.kind === 'marker' ? `marker:${one.name}` : `finished:${one.state}`)
  }
  return { held: current, happened }
}

describe('what a state machine plays', () => {
  it('opens on the state the layer names', () => {
    expect(freshAnimator(WALKING).state).toBe('idle')
  })

  it('walks when the body starts moving', () => {
    const { held } = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 1)

    expect(held.state).toBe('walk')
    expect(held.from?.state).toBe('idle')
  })

  it('shows both clips while the fade runs, and one after it', () => {
    const opening = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 7).held
    const [leaving, entering] = posedClipsOf(WALKING, opening, LENGTHS)

    expect(leaving?.key).toBe('bundled:Idle')
    expect(entering?.key).toBe('bundled:Walk')
    expect((leaving?.weight ?? 0) + (entering?.weight ?? 0)).toBeCloseTo(1)

    const settled = ran(WALKING, opening, { speed: 2 }, 20).held
    expect(posedClipsOf(WALKING, settled, LENGTHS)).toHaveLength(1)
    expect(posedClipsOf(WALKING, settled, LENGTHS)[0]?.weight).toBe(1)
  })

  /**
   * 🛑 The animator hands these very objects to `AnimationPort.pose`, which borrows them for the
   * length of the call — this system was the only one of the loop still allocating on the frame,
   * and a body posed at sixty threw away nine objects a frame.
   */
  it('writes into the buffer it is given, the same objects frame after frame', () => {
    const opening = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 7).held
    const buffer: PosedClip[] = []

    const first = posedClipsOf(WALKING, opening, LENGTHS, buffer)
    const held = [...first]
    const again = posedClipsOf(WALKING, opening, LENGTHS, buffer)

    expect(first).toBe(buffer)
    expect(again).toBe(buffer)
    expect(again[0]).toBe(held[0])
    expect(again[1]).toBe(held[1])
    expect(again.map(clip => clip.key)).toEqual(['bundled:Idle', 'bundled:Walk'])
  })

  // 🛑 Shortened, never left long: a fade that ended would otherwise go on posing the clip it
  // left, at the weight it held on the last frame of the fade.
  it('drops the slot of a clip that has stopped showing', () => {
    const opening = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 7).held
    const buffer: PosedClip[] = []
    posedClipsOf(WALKING, opening, LENGTHS, buffer)

    const settled = ran(WALKING, opening, { speed: 2 }, 20).held

    expect(posedClipsOf(WALKING, settled, LENGTHS, buffer)).toHaveLength(1)
    expect(buffer.map(clip => clip.key)).toEqual(['bundled:Walk'])
  })

  it('holds a clip that does not loop until it has played out', () => {
    const jumped = ran(WALKING, freshAnimator(WALKING), { jumped: true }, 1).held
    // Two seconds of clip against an exitTime of 1: still jumping half a second in.
    const midway = ran(WALKING, jumped, {}, 30).held
    expect(midway.state).toBe('jump')

    const landed = ran(WALKING, midway, {}, 120).held
    expect(landed.state).toBe('idle')
  })

  it('puts a marker on the bus once a lap and again on the next', () => {
    const jumping = ran(WALKING, freshAnimator(WALKING), { jumped: true }, 1).held
    const half = ran(WALKING, jumping, {}, 61)

    expect(half.happened).toEqual(['marker:liftOff'])

    const looping = layerOf({
      states: [
        {
          id: 'idle',
          source: { kind: 'bundled', name: 'Walk' },
          events: [{ id: 'left', at: 0.5, name: 'footstep' }],
        },
      ],
      transitions: [],
    })
    const twice = ran(looping, freshAnimator(looping), {}, 120)
    expect(twice.happened).toEqual(['marker:footstep', 'marker:footstep'])
  })

  it('says a clip that does not loop has finished, once', () => {
    const jumping = ran(WALKING, freshAnimator(WALKING), { jumped: true }, 1).held
    const played = ran(WALKING, jumping, {}, 180)

    expect(played.happened.filter(one => one === 'finished:jump')).toHaveLength(1)
  })

  it('never leaves a state for itself through an any-state way out', () => {
    const jumped = ran(WALKING, freshAnimator(WALKING), { jumped: true }, 1).held
    const again = ran(WALKING, jumped, { jumped: true }, 30).held

    // Held down for half a second: the clip has played on rather than restarting each step.
    expect(again.state).toBe('jump')
    expect(again.time).toBeGreaterThan(0.4)
  })

  it('holds a bool any-state while it stays true, rather than flipping back to idle', () => {
    const dancing = animationGraphOf({
      version: ANIMATION_GRAPH_VERSION,
      id: 'character',
      parameters: [{ id: 'dance', kind: 'boolean' }],
      layers: [
        {
          id: 'base',
          initial: 'idle',
          states: [
            { id: 'idle', source: { kind: 'bundled', name: 'Idle' } },
            { id: 'jump', source: { kind: 'bundled', name: 'Jump' }, loop: false },
          ],
          transitions: [
            { to: 'idle', fade: 0.2, when: [{ param: 'speed', op: '<=', value: 0.1 }] },
            { to: 'jump', fade: 0, when: [{ param: 'dance', op: '==', value: true }] },
          ],
        },
      ],
    }).layers[0]
    if (!dancing) throw new Error('a graph always holds its layer')
    const opened = ran(dancing, freshAnimator(dancing), { dance: true, speed: 0 }, 1).held
    const held = ran(dancing, opened, { dance: true, speed: 0 }, 30).held

    expect(opened.state).toBe('jump')
    expect(held.state).toBe('jump')
    expect(held.time).toBeGreaterThan(0.4)

    const letGo = ran(dancing, held, { dance: false, speed: 0 }, 2).held
    expect(letGo.state).toBe('idle')

    const again = ran(dancing, letGo, { dance: true, speed: 0 }, 2).held
    expect(again.state).toBe('jump')
  })

  it('plays a state at the pace a parameter says', () => {
    const walking = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 1).held
    const fast = ran(WALKING, walking, { speed: 2 }, 60).held
    const slow = ran(WALKING, walking, { speed: 0.5 }, 60).held

    expect(fast.time).toBeCloseTo(2, 1)
    expect(slow.time).toBeCloseTo(0.5, 1)
  })

  it('poses nothing for a clip whose file has not landed, and holds its state', () => {
    const { held } = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 30)

    expect(posedClipsOf(WALKING, held, {})).toEqual([])
    expect(held.state).toBe('walk')
  })

  it('keeps a forced state until it is let go', () => {
    const forced = ran(WALKING, freshAnimator(WALKING), { speed: 2 }, 30, { forced: 'idle' }).held
    expect(forced.state).toBe('idle')

    const released = ran(WALKING, forced, { speed: 2 }, 2, { letGo: true }).held
    expect(released.state).toBe('walk')
  })
})

describe('the shipped character graph', () => {
  const layer = animationGraphPreset('character').layers[0]
  if (!layer) throw new Error('the character graph holds its layer')
  const lengths = {
    'bundled:Idle': 4,
    'bundled:Walk': 1,
    'bundled:StrafeLeft': 1,
    'bundled:StrafeRight': 1,
    'bundled:Jump': 2,
  }
  const stepping = { grounded: true, speed: 4, strafe: 4 }

  it('keeps a side step from flipping back to walk every frame', () => {
    const opened = ran(layer, freshAnimator(layer), stepping, 1, undefined, lengths).held
    expect(opened.state).toBe('stepRight')

    const held = ran(layer, opened, stepping, 30, undefined, lengths).held
    expect(held.state).toBe('stepRight')
    expect(held.time).toBeGreaterThan(0.4)
  })

  it('walks when the body goes forward without stepping aside', () => {
    const { held } = ran(
      layer,
      freshAnimator(layer),
      { grounded: true, speed: 4, strafe: 0.4 },
      3,
      undefined,
      lengths,
    )
    expect(held.state).toBe('walk')
  })
})

describe('what this tree copies from the studio', () => {
  it('reads a clip back at the same ceiling a block on the band is bounded by', () => {
    expect(MAX_RATE).toBe(CLIP_SPEED.max)
  })
})

describe('the key a clip is filed under', () => {
  const SOURCES: readonly ClipSource[] = [
    { kind: 'bundled', name: 'Walk' },
    { kind: 'embedded', name: 'Walk' },
    { kind: 'asset', assetId: 'a1', name: 'Walk' },
    { kind: 'asset', assetId: 'a1', name: 'Walk', clipIndex: 2 },
  ]

  it.each(SOURCES)('says what the studio says for %o', source => {
    expect(clipKeyOf(source)).toBe(studioClipKeyOf(source))
  })
})

describe('whether a condition holds', () => {
  const on = (op: AnimationCondition['op'], value: number | boolean, read: number | boolean) =>
    conditionHolds({ param: 'speed', op, value }, read)

  it('compares a number every way it is asked to', () => {
    expect([on('>', 1, 2), on('>=', 2, 2), on('<', 1, 2)]).toEqual([true, true, false])
    expect([on('<=', 2, 2), on('==', 2, 2), on('!=', 2, 2)]).toEqual([true, true, false])
  })

  it('reads a parameter nobody wrote as nothing rather than refusing it', () => {
    expect(conditionHolds({ param: 'stamina', op: '>', value: 0 }, undefined)).toBe(false)
    expect(conditionHolds({ param: 'armed', op: '==', value: false }, undefined)).toBe(true)
  })
})

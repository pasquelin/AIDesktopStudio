import { describe, expect, it } from 'vitest'
import {
  boundParam,
  defaultParamsOf,
  EMPTY_STACK,
  planStack,
  postEffect,
  POST_EFFECTS,
  POST_EFFECT_IDS,
  postOf,
  readCameraPost,
  readParams,
  readStack,
  stackDraws,
  stackShapeKey,
  unknownEffectsIn,
  type PostStack,
} from './postProcessing'

let minted = 0
const mintId = (): string => `made-${(minted += 1)}`

const stack = (
  ...effects: readonly { id: string; effect: string; enabled?: boolean }[]
): PostStack => ({
  enabled: true,
  effects: effects.map(one => ({
    ...postEffect(one.id, one.effect as never),
    enabled: one.enabled ?? true,
  })),
})

describe('the catalogue', () => {
  it('opens every parameter on a value its own spec accepts', () => {
    const refused = POST_EFFECT_IDS.flatMap(id =>
      Object.entries(POST_EFFECTS[id].params).flatMap(([name, spec]) =>
        boundParam(spec, spec.default) === spec.default ? [] : [`${id}.${name}`],
      ),
    )

    expect(refused).toEqual([])
  })

  /** A channel carries a `Vector3` of numbers: anything else could never be interpolated. */
  it('marks as animatable only the parameters a keyframe could drive', () => {
    const wrong = POST_EFFECT_IDS.flatMap(id =>
      Object.entries(POST_EFFECTS[id].params).flatMap(([name, spec]) =>
        spec.animatable && typeof spec.default !== 'number' ? [`${id}.${name}`] : [],
      ),
    )

    expect(wrong).toEqual([])
  })

  // 🛑 A `gpu` written here without a node factory behind it is a slot the Advanced chain
  // leaves empty with nothing said. The occlusion is the only one that has one.
  it('names an engine for every effect, and the Advanced one only where a node builds it', () => {
    const engines = POST_EFFECT_IDS.map(id => POST_EFFECTS[id].engines)
    const advanced = POST_EFFECT_IDS.filter(id => POST_EFFECTS[id].engines.includes('gpu'))

    expect(engines.every(named => named.length > 0)).toBe(true)
    expect(advanced).toEqual(['gtao'])
  })

  it('gives a fresh instance the defaults of its own effect', () => {
    expect(defaultParamsOf('vignette')).toEqual({ offset: 1, darkness: 1 })
  })
})

describe('what a stack really runs', () => {
  it('orders the bands whatever the list says', () => {
    const plan = planStack(stack({ id: 'a', effect: 'smaa' }, { id: 'b', effect: 'bloom' }))

    expect(plan.effects.map(one => one.id)).toEqual(['b', 'a'])
  })

  it('draws the scene once: a second occlusion is skipped and named', () => {
    const plan = planStack(stack({ id: 'a', effect: 'gtao' }, { id: 'b', effect: 'ssao' }))

    expect(plan.effects.map(one => one.id)).toEqual(['a'])
    expect(plan.skipped.map(one => one.id)).toEqual(['b'])
  })

  it('leaves out an effect that is switched off', () => {
    const plan = planStack(stack({ id: 'a', effect: 'bloom', enabled: false }))

    expect(plan.effects).toEqual([])
    expect(plan.skipped).toEqual([])
  })

  it('draws nothing at all while the composition is switched off', () => {
    const off = { ...stack({ id: 'a', effect: 'bloom' }), enabled: false }

    expect(stackDraws(off)).toBe(false)
    expect(stackDraws(null)).toBe(false)
    expect(stackDraws(EMPTY_STACK)).toBe(false)
  })
})

/**
 * The promise of § 20, and the one thing the whole performance of the system rests on: a moved
 * slider must reach a uniform rather than a rebuild.
 */
describe('the key a compiled chain is held on', () => {
  it('does not move when a parameter does', () => {
    const held = stack({ id: 'a', effect: 'bloom' })
    const moved: PostStack = {
      ...held,
      effects: held.effects.map(one => ({ ...one, params: { ...one.params, strength: 3 } })),
    }

    expect(stackShapeKey(moved)).toBe(stackShapeKey(held))
  })

  it('moves when the order does', () => {
    const one = stack({ id: 'a', effect: 'bloom' }, { id: 'b', effect: 'vignette' })
    const other = stack({ id: 'b', effect: 'vignette' }, { id: 'a', effect: 'bloom' })

    expect(stackShapeKey(other)).not.toBe(stackShapeKey(one))
  })

  it('moves when a switch does', () => {
    const on = stack({ id: 'a', effect: 'bloom' }, { id: 'b', effect: 'vignette' })
    const off = stack({ id: 'a', effect: 'bloom' }, { id: 'b', effect: 'vignette', enabled: false })

    expect(stackShapeKey(off)).not.toBe(stackShapeKey(on))
  })
})

describe('a parameter held to its spec', () => {
  it('brings a number back inside its bounds', () => {
    expect(boundParam(POST_EFFECTS.bloom.params.strength!, 99)).toBe(4)
    expect(boundParam(POST_EFFECTS.bloom.params.strength!, -99)).toBe(0)
  })

  it('falls back on the default for a value of the wrong shape', () => {
    expect(boundParam(POST_EFFECTS.bloom.params.strength!, 'loud')).toBe(0.6)
    expect(boundParam(POST_EFFECTS.filmGrain.params.animated!, 3)).toBe(true)
  })

  it('keeps a word only when the list carries it', () => {
    expect(boundParam(POST_EFFECTS.blur.params.kind!, 'box')).toBe('box')
    expect(boundParam(POST_EFFECTS.blur.params.kind!, 'swirl')).toBe('gaussian')
  })
})

describe('a composition read back off a file', () => {
  it('fills every parameter the effect declares and ignores the rest', () => {
    expect(readParams('vignette', { offset: 2, elsewhere: 9 })).toEqual({
      offset: 2,
      darkness: 1,
    })
  })

  it('drops an effect this build has no code for, and names it', () => {
    const payload = { effects: [{ effect: 'bloom' }, { effect: 'raytracing' }] }

    expect(readStack(payload, mintId).effects.map(one => one.effect)).toEqual(['bloom'])
    expect(unknownEffectsIn(payload)).toEqual(['raytracing'])
  })

  it('mints an id for an instance that carries none', () => {
    const read = readStack({ effects: [{ effect: 'bloom' }] }, () => 'fresh')

    expect(read.effects[0]?.id).toBe('fresh')
  })

  it('comes back empty rather than throwing on anything unreadable', () => {
    expect(readStack(null, mintId)).toEqual(EMPTY_STACK)
    expect(readStack({ effects: 'lots' }, mintId).effects).toEqual([])
  })
})

describe('which composition a camera films through', () => {
  const scene = stack({ id: 'a', effect: 'bloom' })

  it('inherits the scene when it says nothing at all — the migration', () => {
    expect(postOf(scene, undefined)).toBe(scene)
    expect(postOf(scene, { mode: 'inherit' })).toBe(scene)
  })

  it('films through nothing when it is switched off', () => {
    expect(postOf(scene, { mode: 'disabled' })).toBeNull()
  })

  it('films through its own when it overrides', () => {
    const own = stack({ id: 'b', effect: 'vignette' })

    expect(postOf(scene, { mode: 'override', stack: own })).toBe(own)
  })

  it('reads an unreadable camera setting back as inheriting', () => {
    expect(readCameraPost({ mode: 'sometimes' }, mintId)).toEqual({ mode: 'inherit' })
    expect(readCameraPost(null, mintId)).toEqual({ mode: 'inherit' })
  })
})

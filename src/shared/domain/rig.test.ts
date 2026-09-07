import { describe, expect, it } from 'vitest'
import {
  isRig,
  rigFaultOf,
  rigRenamed,
  rigWithBones,
  rigWithoutBone,
  rigWithRole,
  type RigBone,
} from './rig'

const REST = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
}

function bone(name: string, parent: string | null, role?: RigBone['role']): RigBone {
  return { name, parent, rest: REST, ...(role ? { role } : {}) }
}

const SPINE: RigBone[] = [bone('Hips', null, 'Hips'), bone('Spine', 'Hips', 'Spine')]

describe('what makes a rig holdable', () => {
  it('accepts a chain whose every parent is one of its own bones', () => {
    expect(rigFaultOf(SPINE)).toBeNull()
  })

  it('refuses a rig with no bone in it', () => {
    expect(rigFaultOf([])).toBe('empty')
  })

  it('refuses two bones of the same name, which nothing could tell apart', () => {
    expect(rigFaultOf([bone('Hips', null), bone('Hips', null)])).toBe('duplicate-bone')
  })

  it('refuses a parent no bone answers to', () => {
    expect(rigFaultOf([bone('Spine', 'Hips')])).toBe('unknown-parent')
  })

  it('refuses a cycle rather than walking it forever, wherever in the rig it sits', () => {
    expect(rigFaultOf([bone('Hips', 'Spine'), bone('Spine', 'Hips')])).toBe('cycle')
    expect(rigFaultOf([bone('Hips', null), bone('A', 'B'), bone('B', 'A')])).toBe('cycle')
  })

  it('refuses the same humanoid role on two bones', () => {
    const bones = [bone('Hips', null, 'Hips'), bone('Pelvis', 'Hips', 'Hips')]

    expect(rigFaultOf(bones)).toBe('duplicate-role')
  })

  it('lets two bones share no role at all', () => {
    expect(rigFaultOf([bone('Hips', null), bone('Spine', 'Hips')])).toBeNull()
  })

  it('refuses a non-finite rest transform before it reaches Three.js', () => {
    const invalid = bone('Hips', null)
    invalid.rest = { ...REST, position: { ...REST.position, x: Number.NaN } }

    expect(rigFaultOf([invalid])).toBe('invalid-transform')
  })
})

describe('reading a rig off a document', () => {
  it('accepts one a save wrote', () => {
    expect(isRig({ bones: SPINE, origin: 'local' })).toBe(true)
  })

  it('accepts a rig a provider produced, named', () => {
    const origin = { provider: 'uthana', modelId: 'model_uthana-character-rigging' }

    expect(isRig({ bones: SPINE, origin })).toBe(true)
  })

  it('refuses one whose bones break an invariant', () => {
    expect(isRig({ bones: [bone('Spine', 'Hips')], origin: 'local' })).toBe(false)
  })

  it('refuses a bone missing its rest pose', () => {
    expect(isRig({ bones: [{ name: 'Hips', parent: null }], origin: 'local' })).toBe(false)
  })

  it('refuses a role the standard does not hold', () => {
    const bones = [{ name: 'Hips', parent: null, rest: REST, role: 'Tail' }]

    expect(isRig({ bones, origin: 'local' })).toBe(false)
  })

  it('refuses one with no origin at all', () => {
    expect(isRig({ bones: SPINE })).toBe(false)
  })

  const CHAIN = { id: 'ik-1', effector: 'Spine', target: 'Hips', links: ['Hips'] }

  it('accepts a rig that reaches for something', () => {
    expect(isRig({ bones: SPINE, origin: 'local', ik: [CHAIN] })).toBe(true)
  })

  it('refuses a chain with no links, which no reader could turn', () => {
    expect(isRig({ bones: SPINE, origin: 'local', ik: [{ ...CHAIN, links: 'Hips' }] })).toBe(false)
  })

  // Structural only, and deliberately: a bone can leave while a chain still names it, and the
  // solver drops the chain rather than the model — the rule a track lives under too.
  it('accepts a chain naming a bone the rig no longer holds', () => {
    expect(isRig({ bones: SPINE, origin: 'local', ik: [{ ...CHAIN, target: 'Gone' }] })).toBe(true)
  })
})

describe('editing the hierarchy by hand', () => {
  const ARM: RigBone[] = [
    bone('Hips', null, 'Hips'),
    bone('Elbow', 'Hips', 'LeftLowerArm'),
    bone('Wrist', 'Elbow'),
  ]

  it('hangs a new bone where it was asked to', () => {
    expect(rigWithBones(ARM, [bone('Thumb', 'Wrist')])?.at(-1)?.parent).toBe('Wrist')
  })

  it('refuses a bone hung on a parent nobody answers to', () => {
    expect(rigWithBones(ARM, [bone('Thumb', 'Nowhere')])).toBeNull()
  })

  it('refuses a bone taking a role another already fills', () => {
    expect(rigWithBones(ARM, [bone('Other', 'Hips', 'LeftLowerArm')])).toBeNull()
  })

  // Taking an elbow out must not take the hand and every finger with it.
  it('hangs the children of a removed bone where it hung', () => {
    const next = rigWithoutBone(ARM, 'Elbow')

    expect(next.map(one => one.name)).toEqual(['Hips', 'Wrist'])
    expect(next[1]?.parent).toBe('Hips')
  })

  it('leaves the rig alone when the bone is not one of its own', () => {
    expect(rigWithoutBone(ARM, 'Nowhere')).toEqual(ARM)
  })

  it('carries the children over when a bone is renamed', () => {
    const next = rigRenamed(ARM, 'Elbow', 'LeftLowerArm')

    expect(next?.map(one => one.parent)).toEqual([null, 'Hips', 'LeftLowerArm'])
  })

  it('refuses a rename onto a name another bone already wears', () => {
    expect(rigRenamed(ARM, 'Wrist', 'Elbow')).toBeNull()
  })

  // A role lands on one bone: a rig holding one twice is a fault the document reader drops whole.
  it('takes a role off whatever bone was filling it', () => {
    const next = rigWithRole(ARM, 'Wrist', 'LeftLowerArm')

    expect(next.map(one => one.role)).toEqual(['Hips', undefined, 'LeftLowerArm'])
  })

  it('clears a role a bone should never have had', () => {
    expect(rigWithRole(ARM, 'Elbow', null).map(one => one.role)).toEqual([
      'Hips',
      undefined,
      undefined,
    ])
  })
})

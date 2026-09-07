import { describe, expect, it } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { Rig } from '@shared/domain/rig'
import { rigSnappedTo, type MeshSample } from './rigSnap'

const BOUNDS = { min: { x: -0.9, y: 0, z: -0.2 }, max: { x: 0.9, y: 1.8, z: 0.2 } }

/**
 * An arm that SLOPES — every A-pose there is. Points run out along X while dropping in Y, which
 * is exactly the shape a bounding box cannot see: its box is the same as a level arm's.
 */
const AROUND: readonly { dy: number; dz: number }[] = [
  { dy: 0.04, dz: 0 },
  { dy: -0.04, dz: 0 },
  { dy: 0, dz: 0.04 },
  { dy: 0, dz: -0.04 },
]

function slopingArm(): Float32Array {
  const points: number[] = []
  for (let step = 0; step <= 200; step += 1) {
    const x = 0.1 + (step / 200) * 0.7
    const y = 1.5 - (x - 0.1) * 0.5
    // A tube around the centre line, so a cross-section has a centre to find.
    for (const around of AROUND) points.push(x, y + around.dy, around.dz)
  }
  return new Float32Array(points)
}

const SAMPLE: MeshSample = { bounds: BOUNDS, points: slopingArm() }

/** Two joints laid level at the shoulder's height, which is what the proportions produce. */
const LEVEL: Rig = {
  origin: 'local',
  bones: [
    {
      name: 'LeftUpperArm',
      parent: null,
      rest: { ...IDENTITY_TRANSFORM, position: { x: 0.2, y: 1.5, z: 0 } },
      role: 'LeftUpperArm',
    },
    {
      name: 'LeftHand',
      parent: 'LeftUpperArm',
      rest: { ...IDENTITY_TRANSFORM, position: { x: 0.5, y: 0, z: 0 } },
      role: 'LeftHand',
    },
  ],
}

/** Where a bone ends up, by walking its parents back up. */
function world(rig: Rig, name: string): { x: number; y: number; z: number } {
  const at = { x: 0, y: 0, z: 0 }
  let next: string | null = name
  while (next) {
    const bone = rig.bones.find(candidate => candidate.name === next)
    if (!bone) break
    at.x += bone.rest.position.x
    at.y += bone.rest.position.y
    at.z += bone.rest.position.z
    next = bone.parent
  }
  return at
}

describe('pulling a fitted skeleton inside the mesh', () => {
  // MEASURED on screen: a box says how far an arm reaches and never at what height it runs, so
  // the whole chain ran through the air above a sloping arm.
  it('drops each joint onto the arm it is meant to drive', () => {
    const snapped = rigSnappedTo(LEVEL, SAMPLE)

    // The arm falls 0.5 per unit of reach: a wrist at x = 0.7 belongs at y = 1.5 − 0.3.
    expect(world(snapped, 'LeftHand').y).toBeCloseTo(1.2, 1)
    expect(world(LEVEL, 'LeftHand').y).toBeCloseTo(1.5, 6)
  })

  // The proportions say where ALONG a limb a joint belongs; the mesh says where the limb is.
  // Moving all three would slide a wrist up the forearm.
  it('never moves a joint along its own limb', () => {
    const snapped = rigSnappedTo(LEVEL, SAMPLE)

    // To the grain the fit keeps its places on, which is a tenth of a millimetre on a metre.
    expect(world(snapped, 'LeftHand').x).toBeCloseTo(world(LEVEL, 'LeftHand').x, 3)
  })

  it('leaves a rig exactly as it was where there is nothing to read', () => {
    expect(rigSnappedTo(LEVEL, { bounds: BOUNDS, points: new Float32Array() })).toEqual(LEVEL)
  })

  it('leaves a joint alone where its own slice holds too few points to mean anything', () => {
    const far: Rig = {
      ...LEVEL,
      bones: [
        {
          ...LEVEL.bones[0]!,
          rest: { ...IDENTITY_TRANSFORM, position: { x: -0.8, y: 1.5, z: 0 } },
        },
      ],
    }

    const at = world(rigSnappedTo(far, SAMPLE), 'LeftUpperArm')

    expect(at.x).toBeCloseTo(-0.8, 3)
    expect(at.y).toBeCloseTo(1.5, 3)
  })
})

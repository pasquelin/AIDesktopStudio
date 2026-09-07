import { describe, expect, it } from 'vitest'
import { rigFaultOf } from '@shared/domain/rig'
import { HUMANOID_BODY_ROLES } from '@shared/domain/humanoid'
import { rigFit, rigFitFaultOf, type Bounds } from './rigFit'

/** A metre-eighty character standing on the ground, centred on the origin. */
const STANDING: Bounds = { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } }

/** Where a role ended up on one axis in world space, by walking its parents back up. */
function worldOn(bounds: Bounds, role: string, axis: 'x' | 'y' | 'z'): number {
  const bones = rigFit(bounds).bones
  let total = 0
  let name: string | null = role

  while (name) {
    const bone = bones.find(candidate => candidate.name === name)
    if (!bone) throw new Error(`no bone named ${name}`)
    total += bone.rest.position[axis]
    name = bone.parent
  }
  return total
}

const worldY = (bounds: Bounds, role: string): number => worldOn(bounds, role, 'y')
const worldX = (bounds: Bounds, role: string): number => worldOn(bounds, role, 'x')

describe('what a mesh can be fitted with', () => {
  it('fits a standing figure', () => {
    expect(rigFitFaultOf(STANDING)).toBeNull()
  })

  /**
   * A T-pose spans about as wide as it stands, and it is the commonest bind pose there is:
   * requiring height to win would refuse half the characters there are, and tell their author
   * they had laid one down.
   */
  it('fits a figure in a T-pose, whose arms span its own height', () => {
    const tPose: Bounds = { min: { x: -0.95, y: 0, z: -0.2 }, max: { x: 0.95, y: 1.8, z: 0.2 } }

    expect(rigFitFaultOf(tPose)).toBeNull()
  })

  it('refuses a mesh with nothing to measure — no height, no width or no depth', () => {
    const flat: Bounds = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 0, z: 1 } }
    const plane: Bounds = { min: { x: -1, y: 0, z: 0 }, max: { x: 1, y: 2, z: 0 } }

    expect(rigFitFaultOf(flat)).toBe('noGeometry')
    expect(rigFitFaultOf(plane)).toBe('noGeometry')
  })

  /**
   * The proportions are read off the height, so a figure on its side would have every bone laid
   * across its body. Named rather than guessed at: standing it up is the user's call.
   */
  it('names a figure lying down instead of fitting it sideways', () => {
    const lying: Bounds = { min: { x: -0.9, y: 0, z: -0.2 }, max: { x: 0.9, y: 0.4, z: 0.2 } }

    expect(rigFitFaultOf(lying)).toBe('lyingDown')
  })
})

describe('the rig a fit produces', () => {
  it('places every role of the body, and only those', () => {
    expect(
      rigFit(STANDING)
        .bones.map(bone => bone.role)
        .sort(),
    ).toEqual([...HUMANOID_BODY_ROLES].sort())
  })

  it('holds together as a rig: one parent each, no cycle, no role twice', () => {
    expect(rigFaultOf(rigFit(STANDING).bones)).toBeNull()
  })

  it('says the studio built it', () => {
    expect(rigFit(STANDING).origin).toBe('local')
  })

  it('names every bone after the role it fills, so a track can address it', () => {
    expect(rigFit(STANDING).bones.every(bone => bone.name === bone.role)).toBe(true)
  })

  // Bones rest in their PARENT's space: writing world positions there would stack every offset
  // onto the one above it and throw the skeleton off the model entirely.
  it('lands the hips just above mid-height and the head near the top', () => {
    expect(worldY(STANDING, 'Hips')).toBeCloseTo(0.954, 3)
    expect(worldY(STANDING, 'Head')).toBeCloseTo(1.656, 3)
  })

  it('stacks the arm down the body: shoulder above elbow above hand', () => {
    expect(worldY(STANDING, 'LeftShoulder')).toBeGreaterThan(worldY(STANDING, 'LeftLowerArm'))
    expect(worldY(STANDING, 'LeftLowerArm')).toBeGreaterThan(worldY(STANDING, 'LeftHand'))
  })

  // MEASURED on screen: every T-posed character — the commonest bind pose there is — got a
  // skeleton whose arms hung down its side while its own arms were straight out, so no joint of
  // an arm was anywhere near the mesh it was meant to drive.
  it('holds the arms OUT for a mesh whose box says they are, at the shoulder line', () => {
    const tPose: Bounds = { min: { x: -0.9, y: 0, z: -0.2 }, max: { x: 0.9, y: 1.8, z: 0.2 } }
    const shoulder = worldY(tPose, 'LeftShoulder')

    expect(worldY(tPose, 'LeftHand')).toBeCloseTo(shoulder, 6)
    expect(worldX(tPose, 'LeftHand')).toBeGreaterThan(worldX(tPose, 'LeftLowerArm'))
    expect(worldX(tPose, 'LeftLowerArm')).toBeGreaterThan(worldX(tPose, 'LeftUpperArm'))
  })

  // The wider horizontal axis is the one the shoulders run along, and it is measured: assuming X
  // laid the whole skeleton ACROSS a model authored facing +X, read on screen as a quarter turn.
  it('runs the shoulders along the axis the mesh is widest on, not along X', () => {
    const facingX: Bounds = { min: { x: -0.2, y: 0, z: -0.9 }, max: { x: 0.2, y: 1.8, z: 0.9 } }
    const bones = rigFit(facingX).bones
    const shoulder = bones.find(bone => bone.name === 'LeftShoulder')?.rest.position

    expect(Math.abs(shoulder?.z ?? 0)).toBeGreaterThan(Math.abs(shoulder?.x ?? 0))
  })

  it('stacks the leg down to the floor: hip above knee above foot', () => {
    expect(worldY(STANDING, 'LeftUpperLeg')).toBeGreaterThan(worldY(STANDING, 'LeftLowerLeg'))
    expect(worldY(STANDING, 'LeftLowerLeg')).toBeGreaterThan(worldY(STANDING, 'LeftFoot'))
  })

  it('hangs the legs off the hips and the arms off the chest', () => {
    const bones = rigFit(STANDING).bones
    const parentOf = (name: string) => bones.find(bone => bone.name === name)?.parent

    expect(parentOf('LeftUpperLeg')).toBe('Hips')
    expect(parentOf('LeftShoulder')).toBe('UpperChest')
  })

  it('mirrors the sides, so a left hand is not where the right one is', () => {
    const bones = rigFit(STANDING).bones
    const restX = (name: string) => bones.find(bone => bone.name === name)?.rest.position.x ?? 0

    expect(restX('LeftShoulder')).toBeCloseTo(-restX('RightShoulder'), 6)
    expect(restX('LeftShoulder')).toBeGreaterThan(0)
  })

  // Everything is a fraction of the height, so a model authored in centimetres has to come out
  // proportionally identical to the same model in metres.
  it('scales with the mesh rather than assuming a unit', () => {
    const big: Bounds = { min: { x: -30, y: 0, z: -20 }, max: { x: 30, y: 180, z: 20 } }

    expect(worldY(big, 'Hips')).toBeCloseTo(worldY(STANDING, 'Hips') * 100, 4)
  })

  it('follows a mesh that does not stand on the origin', () => {
    const raised: Bounds = { min: { x: 9.7, y: 5, z: -0.2 }, max: { x: 10.3, y: 6.8, z: 0.2 } }

    expect(worldY(raised, 'Hips')).toBeCloseTo(5.954, 3)
    expect(rigFit(raised).bones[0]?.rest.position.x).toBeCloseTo(10, 6)
  })
})

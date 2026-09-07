import {
  AnimationClip,
  Bone,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  welcomeRootHeld,
  welcomeRootMotion,
  welcomeStepOver,
  type WelcomeRootMotion,
} from './welcomeRoot'

const DURATION = 1.067
const TRAVEL = 1.395

/** A clip that walks straight along +z at a steady rate, so a sum has an exact answer to meet. */
const steady: WelcomeRootMotion = {
  travelAt: time => ({ x: 0, z: (TRAVEL * Math.min(Math.max(time, 0), DURATION)) / DURATION }),
  heightAt: () => 0,
  turnAt: () => 0,
}

describe('welcomeStepOver', () => {
  it('covers a whole clip length per cycle, loops included', () => {
    let covered = 0
    let time = 0
    for (let frame = 0; frame < 180; frame += 1) {
      covered += welcomeStepOver(steady, DURATION, time, 1 / 60).z
      time = (time + 1 / 60) % DURATION
    }

    expect(covered).toBeCloseTo((3 * TRAVEL) / DURATION, 3)
  })

  it('pushes nothing once the clip is spent, which is where a crossfade holds it', () => {
    expect(welcomeStepOver(steady, DURATION, DURATION, 1 / 60)).toEqual({ x: 0, z: 0, turned: 0 })
    expect(welcomeStepOver(steady, DURATION, DURATION + 0.2, 1 / 60)).toEqual({
      x: 0,
      z: 0,
      turned: 0,
    })
  })
})

const Y = new Vector3(0, 1, 0)

function hip(): Bone {
  const root = new Object3D()
  const bone = new Bone()
  bone.name = 'Hips'
  bone.position.set(0, 1, 0)
  root.add(bone)
  return bone
}

function yawOf(values: ArrayLike<number>): number {
  const held = new Quaternion().fromArray(values)
  const facing = new Vector3(0, 0, 1).applyQuaternion(held)
  return Math.atan2(facing.x, facing.z)
}

describe('welcomeRootHeld', () => {
  it('drops the root’s travel so the group can own it without a double stride', () => {
    const bone = hip()
    const clip = new AnimationClip('Walk', 1, [
      new VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 0, 1, 2]),
      new QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ])
    const held = welcomeRootHeld(clip, bone, 'Hips.position', () => 0)

    expect(held.tracks.map(track => track.name)).toEqual(['Hips.quaternion'])
  })

  it('takes the path yaw off the hip and leaves the stride’s own sway', () => {
    const bone = hip()
    const yaw = (angle: number) => new Quaternion().setFromAxisAngle(Y, angle)
    const clip = new AnimationClip('TurnLeft', 1, [
      new VectorKeyframeTrack('Hips.position', [0, 1], [0, 1, 0, 1, 1, 1]),
      new QuaternionKeyframeTrack(
        'Hips.quaternion',
        [0, 0.5, 1],
        [...yaw(0).toArray(), ...yaw(Math.PI / 4 + 0.2).toArray(), ...yaw(Math.PI / 2).toArray()],
      ),
    ])
    const motion = welcomeRootMotion(clip, bone, 1)
    const held = welcomeRootHeld(clip, bone, 'Hips.position', motion.turnAt)
    const spin = held.tracks[0]
    expect(spin).toBeTruthy()
    const along = spin?.InterpolantFactoryMethodLinear()
    expect(along && yawOf(along.evaluate(1))).toBeCloseTo(0, 2)
    expect(along && yawOf(along.evaluate(0.5))).toBeCloseTo(0.2, 1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  BONE_REACH,
  nearestProjected,
  nearestSegment,
  type ProjectedBone,
  type ProjectedSegment,
} from './bonePicking'

const bone = (name: string, x: number, y: number, z = 0): ProjectedBone => ({
  nodeId: 'rig',
  bone: name,
  x,
  y,
  z,
})

describe('picking a bone off the screen', () => {
  it('answers the one under the pointer', () => {
    const bones = [bone('Hips', 0, 0), bone('Head', 0.5, 0.5)]
    expect(nearestProjected(bones, { x: 0.5, y: 0.5 })?.bone).toBe('Head')
  })

  it('answers the NEAREST when several are within reach', () => {
    const bones = [bone('Hips', 0, 0), bone('Spine', 0.01, 0)]
    expect(nearestProjected(bones, { x: 0.011, y: 0 })?.bone).toBe('Spine')
  })

  it('answers nothing when the pointer is clear of every bone', () => {
    expect(nearestProjected([bone('Hips', 0, 0)], { x: 0.9, y: 0.9 })).toBeNull()
  })

  it('answers nothing at all when the rig has no bone', () => {
    expect(nearestProjected([], { x: 0, y: 0 })).toBeNull()
  })

  it('takes the one in FRONT when two project to the same spot', () => {
    const behind = bone('Behind', 0, 0, 0.9)
    const front = bone('Front', 0, 0, -0.9)
    expect(nearestProjected([behind, front], { x: 0, y: 0 })?.bone).toBe('Front')
    // And the order they arrive in must not decide it.
    expect(nearestProjected([front, behind], { x: 0, y: 0 })?.bone).toBe('Front')
  })

  it('ignores a bone behind the camera, however near it projects', () => {
    expect(nearestProjected([bone('Hips', 0, 0, -1.5)], { x: 0, y: 0 })).toBeNull()
  })

  it('ignores a bone past the far plane', () => {
    expect(nearestProjected([bone('Hips', 0, 0, 1.5)], { x: 0, y: 0 })).toBeNull()
  })

  it('honours the reach it is given, so a caller may tighten it', () => {
    const bones = [bone('Hips', 0, 0)]
    expect(nearestProjected(bones, { x: BONE_REACH / 2, y: 0 })).not.toBeNull()
    expect(nearestProjected(bones, { x: BONE_REACH / 2, y: 0 }, 0.001)).toBeNull()
  })

  it('accepts a bone exactly on the edge of the reach', () => {
    expect(nearestProjected([bone('Hips', 0, 0)], { x: BONE_REACH, y: 0 })).not.toBeNull()
  })
})

describe('picking a whole bone rather than the point at its head', () => {
  const flat = (
    name: string,
    head: [number, number],
    tail: [number, number],
  ): ProjectedSegment => ({
    nodeId: 'model',
    bone: name,
    head: { x: head[0], y: head[1], z: 0 },
    tail: { x: tail[0], y: tail[1], z: 0 },
  })

  const ARM = flat('LeftLowerArm', [-0.5, 0], [0.5, 0])

  // A long bone could only be taken by aiming at one of its ends: the middle of every thigh and
  // every forearm was dead to the click.
  it('takes a bone by its middle, where both joints are far away', () => {
    expect(nearestSegment([ARM], { x: 0, y: 0.01 })?.bone).toBe('LeftLowerArm')
  })

  it('answers nothing for a pointer further off than the reach', () => {
    expect(nearestSegment([ARM], { x: 0, y: 0.5 })).toBeNull()
  })

  // Two bones crossing on screen are one in front of the other, and the front one is the one
  // being looked at.
  it('takes the front one of two that cross', () => {
    const near: ProjectedSegment = {
      ...ARM,
      bone: 'Near',
      head: { x: -0.5, y: 0, z: -0.5 },
      tail: { x: 0.5, y: 0, z: -0.5 },
    }
    const far: ProjectedSegment = {
      ...ARM,
      bone: 'Far',
      head: { x: -0.5, y: 0, z: 0.5 },
      tail: { x: 0.5, y: 0, z: 0.5 },
    }

    expect(nearestSegment([far, near], { x: 0, y: 0 })?.bone).toBe('Near')
  })

  // The wrist is where the forearm ENDS and the hand STARTS: taking the first of the two made
  // the hand unclickable, its joint always answering « LeftLowerArm » — measured on screen.
  it('gives a shared joint to the bone that starts there, not the one that ends there', () => {
    const hand = flat('LeftHand', [0.5, 0], [0.6, 0])

    expect(nearestSegment([ARM, hand], { x: 0.5, y: 0.005 })?.bone).toBe('LeftHand')
    expect(nearestSegment([hand, ARM], { x: 0.5, y: 0.005 })?.bone).toBe('LeftHand')
  })

  // A bone with no child projects to a point, which is what the joint-only pick used to answer.
  it('still takes a bone with no child, which is its own head twice', () => {
    const tip = flat('LeftHand', [0.2, 0.2], [0.2, 0.2])

    expect(nearestSegment([tip], { x: 0.21, y: 0.21 })?.bone).toBe('LeftHand')
    expect(nearestSegment([tip], { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('skips a bone that is off screen at both ends, and keeps one that is half in', () => {
    const gone: ProjectedSegment = {
      ...ARM,
      bone: 'Gone',
      head: { x: 0, y: 0, z: 2 },
      tail: { x: 0.1, y: 0, z: 3 },
    }
    const half: ProjectedSegment = { ...ARM, bone: 'Half', tail: { x: 0.5, y: 0, z: 2 } }

    expect(nearestSegment([gone], { x: 0, y: 0 })).toBeNull()
    expect(nearestSegment([half], { x: 0, y: 0 })?.bone).toBe('Half')
  })
})

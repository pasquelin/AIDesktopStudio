// @vitest-environment jsdom
import {
  AnimationClip,
  QuaternionKeyframeTrack,
  AnimationMixer,
  LoopOnce,
  Vector3,
  VectorKeyframeTrack,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { expect, it } from 'vitest'
import { wireBonesOf, wireClipOf } from '@/engines/scene/retarget'
import type { WireBone, WireTransform } from '@/engines/scene/retargetMessage'
import { exportRetarget } from './retargetDraft'

it('reloads an exported movement with its skeleton and its animated channel', async () => {
  const bytes = await exportRetarget(
    [
      { name: 'Hips', parent: -1, position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      { name: 'Spine', parent: 0, position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    ],
    wireClipOf(
      new AnimationClip('turn', 1, [
        new QuaternionKeyframeTrack(
          'Spine.quaternion',
          [0, 1],
          [0, 0, 0, 1, 0, 0, 0.7071068, 0.7071068],
        ),
      ]),
    ),
  )
  const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')
  expect(wireBonesOf(loaded.scene).map(bone => bone.name)).toEqual(['Hips', 'Spine'])
  expect(loaded.animations[0]?.tracks[0]?.values.at(-2)).toBeCloseTo(0.7071068)
})

it('exports parent frames as non-joints and replays the same world-space displacement', async () => {
  const frames = [
    {
      position: [0, 0, 0],
      quaternion: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      scale: [0.01, 0.01, 0.01],
    },
  ] satisfies WireTransform[]
  const bones = [
    {
      name: 'Hips',
      parent: -1,
      position: [0, 0, -99.7919],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
      parentFrames: frames,
    },
  ] satisfies WireBone[]
  const clip = wireClipOf(
    new AnimationClip('travel', 1, [
      new VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, -99.7919, 0, 177, -99.7919]),
    ]),
  )
  const bytes = await exportRetarget(bones, clip)
  const loaded = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '')
  const joints = wireBonesOf(loaded.scene)
  expect(joints.map(bone => bone.name)).toEqual(['Hips'])
  expect(joints[0]?.parentFrames).toHaveLength(1)
  const hips = loaded.scene.getObjectByName('Hips')
  if (!hips || !loaded.animations[0]) throw new Error('missing exported motion')
  const mixer = new AnimationMixer(loaded.scene)
  const action = mixer.clipAction(loaded.animations[0]).setLoop(LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  mixer.setTime(0)
  const first = hips.getWorldPosition(new Vector3())
  mixer.setTime(1)
  const last = hips.getWorldPosition(new Vector3())
  expect(first.y).toBeCloseTo(0.997919)
  expect(last.y - first.y).toBeCloseTo(0)
  expect(last.z - first.z).toBeCloseTo(1.77)
})

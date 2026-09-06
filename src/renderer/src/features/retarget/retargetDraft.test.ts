// @vitest-environment jsdom
import { AnimationClip, QuaternionKeyframeTrack } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { expect, it } from 'vitest'
import { wireBonesOf, wireClipOf } from '@/engines/scene/retarget'
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

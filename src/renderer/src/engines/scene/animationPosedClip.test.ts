import { AnimationClip, Object3D, VectorKeyframeTrack } from 'three'
import { expect, it } from 'vitest'
import type { PosedClip } from '@game/ports/animationPort'
import { SceneAnimations } from './animation'

function walkClip(name: string, to: number): AnimationClip {
  return new AnimationClip(name, 1, [
    new VectorKeyframeTrack('cube.position', [0, 1], [0, 0, 0, to, 0, 0]),
  ])
}

function scene(): Object3D {
  const root = new Object3D()
  const cube = new Object3D()
  cube.name = 'cube'
  root.add(cube)
  return root
}

const posed = (key: string): PosedClip => ({
  key,
  time: 1,
  weight: 1,
  part: 'all',
  rootMotion: 'travel',
})

it('does not rest the model when another filed clip is taken off', () => {
  const animations = new SceneAnimations()
  const root = scene()
  animations.add('node-1', root, [])
  animations.addClip('node-1', 'walk', walkClip('walk', 4))
  animations.addClip('node-1', 'spare', walkClip('spare', 1))
  animations.pose('node-1', [posed('walk')])
  expect(root.children[0]?.position.x).toBeCloseTo(4)
  animations.removeClip('node-1', 'spare')
  expect(root.children[0]?.position.x).toBeCloseTo(4)
})

it('keeps the last pose when the posed clip itself is taken off', () => {
  const animations = new SceneAnimations()
  const root = scene()
  animations.add('node-1', root, [])
  animations.addClip('node-1', 'walk', walkClip('walk', 4))
  animations.pose('node-1', [posed('walk')])
  animations.removeClip('node-1', 'walk')
  expect(root.children[0]?.position.x).toBeCloseTo(4)
  expect(animations.lengthsOf('node-1').walk).toBeUndefined()
})

import { AnimationClip, Bone, Group, VectorKeyframeTrack, type Object3D } from 'three'
import { vi } from 'vitest'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import type { MotionView } from './components/Retarget/RetargetViewport'

export function motionClip(distance: number): AnimationClip {
  return new AnimationClip('same', 1, [
    new VectorKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, distance, 0, 0]),
  ])
}

export async function motionView(clips: AnimationClip[] = []): Promise<MotionView> {
  const root = new Group()
  let parent: Object3D = root
  for (const name of ['Hips', 'Spine', 'Head']) {
    const bone = new Bone()
    bone.name = name
    parent.add(bone)
    parent = bone
  }
  root.animations = clips
  const engine = new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: async () => root,
    bvh: { accelerate: async () => {}, dispose: () => {} },
  })
  engine.apply({ ...EMPTY_SCENE, nodes: [modelNodeFixture('model')] })
  await vi.waitFor(() => {
    if (!engine.inspectMotion('model')) throw new Error('model loading')
  })
  const motion = engine.inspectMotion('model')
  if (!motion) throw new Error('missing fixture model')
  return { engine, nodeId: 'model', ...motion }
}

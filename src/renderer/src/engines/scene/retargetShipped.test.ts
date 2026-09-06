/**
 * The shipped character playing a shipped clip, through the very chain the worker runs. 🛑 The one
 * guard that reads the FILES: every unit test before it built its own rig, and none could see that
 * the shipped clips hang their skeleton under an armature the character has not got.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AnimationClip, AnimationMixer, Vector3, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js'
import { describe, expect, it } from 'vitest'
import {
  clipFromWire,
  nodeTrackNameOf,
  restOffsetsOf,
  retargetPlanOf,
  skeletonScaleOf,
  skinnedFromWire,
  wireBonesOf,
  wireClipOf,
} from './retarget'

const RESOURCES = join(process.cwd(), 'resources')

// What `GLTFLoader` reaches for while decoding textures, and which a node run has not got. The
// rig is what this reads; an image that never becomes one changes nothing about a bone.
Reflect.set(globalThis, 'self', globalThis)
Reflect.set(globalThis, 'createImageBitmap', async () => ({ width: 1, height: 1, close: () => {} }))

async function loaded(file: string): Promise<Object3D> {
  const data = readFileSync(file)
  const gltf = await new GLTFLoader().parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    '',
  )
  const scene = gltf.scene
  scene.animations = gltf.animations
  scene.updateMatrixWorld(true)

  return scene
}

const heightOf = (tree: Object3D, name: string): number => {
  const bone = tree.getObjectByName(name)
  if (!bone) throw new Error(`no bone named ${name}`)

  return new Vector3().setFromMatrixPosition(bone.matrixWorld).y
}

/** The clip as the studio plays it: retargeted, then spelled the way a glTF names its nodes. */
function adapted(body: Object3D, file: Object3D): AnimationClip {
  const clip = file.animations[0]
  if (!clip) throw new Error('the shipped clip carries no animation')

  const plan = retargetPlanOf(wireBonesOf(body), wireBonesOf(file), [wireClipOf(clip)])
  const target = skinnedFromWire(plan.target)
  const source = skinnedFromWire(plan.source)
  const first = plan.clips[0]
  if (!first) throw new Error('the plan carries no clip')

  const sampled = retargetClip(target, source, clipFromWire(first), {
    names: plan.names,
    hip: plan.hip,
    fps: plan.fps,
    scale: skeletonScaleOf(target, source),
    localOffsets: restOffsetsOf(target, source, plan.names),
  })

  return new AnimationClip(
    sampled.name,
    clip.duration,
    sampled.tracks.map(track => {
      const renamed = track.clone()
      renamed.name = nodeTrackNameOf(track.name)

      return renamed
    }),
  )
}

describe('a shipped clip on the shipped character', () => {
  it('stays a standing humanoid of its own size, all the way through the cycle', async () => {
    const body = await loaded(join(RESOURCES, 'characters', 'HeroLow.glb'))
    const file = await loaded(join(RESOURCES, 'animations', 'Walk', 'animation.glb'))
    const clip = adapted(body, file)

    const mixer = new AnimationMixer(body)
    const action = mixer.clipAction(clip)
    action.play()

    const posed: { hips: number; head: number }[] = []
    for (let step = 0; step <= 8; step += 1) {
      action.time = (step / 8) * clip.duration
      mixer.update(0)
      body.updateMatrixWorld(true)
      posed.push({ hips: heightOf(body, 'Hips'), head: heightOf(body, 'Head') })
    }

    // Measured 2026-09-06 on the shipped pair: hips 0.85 m, head 1.38 m. Folded into the root
    // bone instead of left in the hierarchy, the armature read the head 1.4 cm over the hips —
    // a character on its back — and carried it 75 m up in half a cycle.
    for (const { hips, head } of posed) {
      expect(head - hips).toBeGreaterThan(0.4)
      expect(hips).toBeGreaterThan(0.5)
      expect(hips).toBeLessThan(1.2)
    }
  }, 30000)
})

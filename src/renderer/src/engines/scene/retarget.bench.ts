import { AnimationClip, QuaternionKeyframeTrack, type Matrix4 } from 'three'
import { retargetClip, type RetargetClipOptions } from 'three/addons/utils/SkeletonUtils.js'
import { test } from 'vitest'
import { restOffsetsOf, retargetPlanOf, skinnedFromWire, skeletonScaleOf } from './retarget'
import type { WireBone } from './retargetMessage'

// Synthetic binary hierarchy, 77 joints; fixture construction is outside the measured solve.
const bones: WireBone[] = Array.from({ length: 77 }, (_, index) => ({
  name: index === 0 ? 'Hips' : index === 1 ? 'Spine' : index === 2 ? 'Head' : `joint${index}`,
  parent: index === 0 ? -1 : Math.floor((index - 1) / 2),
  position: [0, index === 0 ? 1 : 0.1, 0],
  quaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
}))
const target = skinnedFromWire(
  bones.map(bone => ({
    ...bone,
    position: [bone.position[0], bone.position[1] * 1.5, bone.position[2]],
  })),
)
const source = skinnedFromWire(bones)
const names = retargetPlanOf(bones, bones, []).names
const localOffsets = restOffsetsOf(target, source, names)
const scale = skeletonScaleOf(target, source)
const clips = [10, 60].map(duration => {
  const times = Array.from({ length: duration * 30 + 1 }, (_, index) => index / 30)
  const values = times.flatMap(time => [
    0,
    Math.sin(time) * 0.1,
    0,
    Math.sqrt(1 - Math.sin(time) ** 2 * 0.01),
  ])
  return new AnimationClip(
    `${duration}s`,
    duration,
    bones.map(bone => new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values)),
  )
})

for (const clip of clips)
  test(`three retarget solve ${clip.name}, 77 joints, 30 fps`, async ({ bench }) => {
    const result = await bench(clip.name, () => {
      const options: RetargetClipOptions & { localOffsets: Record<string, Matrix4> } = {
        names,
        hip: 'Hips',
        fps: 30,
        scale,
        localOffsets,
      }
      retargetClip(target, source, clip, options)
    }).run({ iterations: 15, time: 0, warmupIterations: 2, warmupTime: 0, retainSamples: true })
    const samples = result.latency.samples ?? []
    console.warn(
      JSON.stringify({
        fixture: clip.name,
        samples: samples.length,
        p50Ms: result.latency.p50,
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        scope: 'three retargetClip only; no load, wire encoding, worker messages or GPU',
      }),
    )
  }, 60000)

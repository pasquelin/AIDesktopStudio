/**
 * Deliberately not a `Pass`: an effect may be several (a separable blur), none of its own
 * (anything fused), or one of three.js's. What they share is being BUILT once and WRITTEN
 * every frame.
 */
import type { Camera, Scene } from 'three'
import type { Pass } from 'three/addons/postprocessing/Pass.js'
import type { PostEffect } from '@shared/domain/postProcessing'
import type { PostBudget } from './postQuality'

/** What THIS draw is: the scene and the lens it is drawn through, at the size it is drawn. */
export type ViewInfo = {
  scene: Scene
  camera: Camera
  /** The size of the pass chain, in pixels — already divided by the budget. */
  width: number
  height: number
  /** Seconds. What grain and tape jitter advance on; never a frame count. */
  time: number
  budget: PostBudget
}

export type EffectInstance = {
  /** Empty for a fused effect: its arithmetic lives inside a pass it shares with its neighbours. */
  passes: readonly Pass[]
  /** Moves the parameters into the uniforms. It must NEVER rebuild — see `stackShapeKey`. */
  apply: (effect: PostEffect, view: ViewInfo) => void
  dispose: () => void
}

/** One pass, written per frame — the shape ten of the eleven standalone effects take. */
export function onePass(pass: Pass, apply: EffectInstance['apply']): EffectInstance {
  return {
    passes: [pass],
    apply,
    dispose: () => pass.dispose(),
  }
}

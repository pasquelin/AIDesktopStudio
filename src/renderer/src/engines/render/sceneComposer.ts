/**
 * What a composition is, to the scene engine — the one contract both chains answer.
 *
 * The Compatible engine builds an `EffectComposer` of GLSL passes and the Advanced one a
 * `RenderPipeline` of TSL nodes; neither shape reaches the scene, which asks for a picture on a
 * surface and is told nothing about how it was made.
 */
import type { Camera, Scene, WebGLRenderTarget } from 'three'
import type { PostStack } from '@shared/domain/postProcessing'
import type { ViewportQuality } from '@shared/domain/scene'

/**
 * Where on the CANVAS a composition lands, in CSS pixels — both renderers multiply by the device
 * ratio themselves, so a rect pre-multiplied here scissors a pane off screen on a HiDPI display.
 *
 * The same four members as `PaneRect`, and written apart on purpose: this file is the contract
 * both chains answer, and a pane is a thing of the editor's viewport that a game does not have.
 */
type ComposerRect = { x: number; y: number; width: number; height: number }

export type ComposerJob = {
  /** Stable destination identity, independent of dimensions, cameras and temporary targets. */
  surface: string
  /**
   * Whether this chain will be built, drawn and freed for ONE picture — a still, a film frame, a
   * validation capture. Said by the caller rather than guessed from `surface`: what an effect
   * that resolves against the frames before it needs is FRAMES, and a destination name is a
   * different fact that happens to correlate. See `survivesOneShot`.
   */
  oneShot: boolean
  scene: Scene
  camera: Camera
  stack: PostStack
  /** `null` draws on the canvas — into `rect` when one is given, over the whole of it when not. */
  target: WebGLRenderTarget | null
  rect?: ComposerRect
  /** The destination, in pixels. A chain may be built smaller — see the two quality budgets. */
  width: number
  height: number
  quality: ViewportQuality
  /** Whether the world asks for a tone curve. Decides the precision a chain carries. */
  toneMapped: boolean
  /** Seconds. What grain and tape jitter advance on — the playhead during a film. */
  time: number
}

export type SceneComposer = {
  draw: (job: ComposerJob) => void
  /** Frees every chain no live stack asks for — a scene closed, a camera stopped overriding. */
  sweep: (live: readonly PostStack[]) => void
  /** A closed preview or completed export must not retain its potentially large buffers. */
  releaseSurface: (surface: string) => void
  dispose: () => void
}

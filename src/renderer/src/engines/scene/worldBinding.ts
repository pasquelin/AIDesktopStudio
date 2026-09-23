/**
 * A `SceneWorld` put onto three.js: the haze in the air, and how high dynamic range comes down
 * to a screen.
 *
 * The targets are typed by what is READ of them rather than as `Scene` and `WebGLRenderer` —
 * the same reason `shadows.ts` does it — so the arithmetic is measured without a GL context.
 */
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  Fog,
  FogExp2,
  LinearToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  type ToneMapping as ThreeToneMapping,
} from 'three'
import type { FogDescriptor, ToneMapping } from '@shared/domain/scene'

/** The one place the studio's words meet three.js's constants. */
const TONE_MAPPINGS: Record<ToneMapping, ThreeToneMapping> = {
  none: NoToneMapping,
  linear: LinearToneMapping,
  reinhard: ReinhardToneMapping,
  cineon: CineonToneMapping,
  aces: ACESFilmicToneMapping,
  agx: AgXToneMapping,
}

export function toneMappingOf(mapping: ToneMapping): ThreeToneMapping {
  return TONE_MAPPINGS[mapping]
}

type FogHolder = { fog: Fog | FogExp2 | null }

/**
 * Points a scene at the haze a document asks for, reusing the object it already holds whenever
 * the form has not changed.
 *
 * Reuse is not a micro-optimisation here: `scene.fog` going from absent to present changes the
 * shader cache key, so every material in the scene recompiles. Moving a colour or a distance on
 * a fog already in place is a uniform, and a slider drag has to stay one.
 */
export function applyFog(scene: FogHolder, wanted: FogDescriptor): void {
  if (wanted.kind === 'none') {
    scene.fog = null
    return
  }

  if (wanted.kind === 'linear') {
    const held = scene.fog instanceof Fog ? scene.fog : new Fog(0)
    held.color.set(wanted.color)
    held.near = wanted.near
    held.far = wanted.far
    scene.fog = held
    return
  }

  const held = scene.fog instanceof FogExp2 ? scene.fog : new FogExp2(0)
  held.color.set(wanted.color)
  held.density = wanted.density
  scene.fog = held
}

type ToneHolder = { toneMapping: ThreeToneMapping; toneMappingExposure: number }

/**
 * Sets how a frame is brought down to the screen. The mapping is a shader define and recompiles
 * what it changes; the exposure is a uniform, which is what makes it draggable.
 */
export function applyToneMapping(
  renderer: ToneHolder,
  mapping: ToneMapping,
  exposure: number,
): void {
  renderer.toneMapping = toneMappingOf(mapping)
  renderer.toneMappingExposure = exposure
}

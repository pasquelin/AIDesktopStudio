/**
 * The compositions the studio ships with, and the file two projects exchange one through.
 *
 * A preset is code, like a scene template: no file to fetch, nothing to install. What it holds is
 * a stack — which effects, in which order, on which values — and it is applied by BUILDING that
 * stack, never by pointing at it. A document that referenced a preset would change look the day
 * the preset did.
 */
import { isRecord } from '../guards'
import {
  postEffect,
  readParams,
  readStack,
  unknownEffectsIn,
  type PostEffectId,
  type PostParamValue,
  type PostStack,
} from './postProcessing'

/** One line of a preset: an effect, and only the values it disagrees with its defaults on. */
export type PostPresetStep = {
  effect: PostEffectId
  params?: Readonly<Record<string, PostParamValue>>
}

export type PostPresetId =
  | 'none'
  | 'natural'
  | 'studio'
  | 'cinematic'
  | 'cinematicWarm'
  | 'cinematicCold'
  | 'dream'
  | 'horror'
  | 'cyberpunk'
  | 'vintageFilm'
  | 'productShot'
  | 'game'
  | 'psx'
  | 'gameBoy'
  | 'arcade'
  | 'speedRush'
  | 'damage'
  | 'nightVision'
  | 'underwater'
  | 'comic'
  | 'anime'
  | 'painterly'
  | 'noir'

/**
 * `Record` keyed on the union: a preset named without a recipe fails to compile.
 *
 * The values are not decoration. Each of these was written as a LOOK — an occlusion pass to sit
 * things on the ground, a bloom whose threshold is above the diffuse range so only emissives
 * bloom, a grade that moves contrast and saturation together, and a vignette that closes it.
 * A preset that switched effects on without agreeing values would be worse than none.
 */
export const POST_PRESETS: Record<PostPresetId, readonly PostPresetStep[]> = {
  none: [],

  natural: [
    { effect: 'colorGrading', params: { contrast: 1.04, saturation: 1.02 } },
    { effect: 'smaa' },
  ],

  studio: [
    { effect: 'gtao', params: { radius: 0.2, blend: 0.7 } },
    { effect: 'bloom', params: { strength: 0.25, radius: 0.3, threshold: 1 } },
    { effect: 'colorGrading', params: { contrast: 1.08, saturation: 1.06, gain: 1.02 } },
    { effect: 'smaa' },
  ],

  cinematic: [
    { effect: 'gtao', params: { radius: 0.3, blend: 0.85 } },
    { effect: 'bloom', params: { strength: 0.5, radius: 0.5, threshold: 0.9 } },
    {
      effect: 'colorGrading',
      params: { contrast: 1.18, saturation: 0.94, gamma: 1.03, lift: 0.02 },
    },
    { effect: 'vignette', params: { offset: 0.9, darkness: 1.15 } },
    { effect: 'filmGrain', params: { intensity: 0.12, size: 1.2 } },
    { effect: 'smaa' },
  ],

  cinematicWarm: [
    { effect: 'gtao', params: { radius: 0.3, blend: 0.85 } },
    { effect: 'bloom', params: { strength: 0.55, radius: 0.55, threshold: 0.85 } },
    {
      effect: 'colorGrading',
      params: { contrast: 1.16, saturation: 1.02, temperature: 0.28, tint: 0.06, lift: 0.03 },
    },
    { effect: 'vignette', params: { offset: 0.9, darkness: 1.1 } },
    { effect: 'filmGrain', params: { intensity: 0.12, size: 1.2 } },
    { effect: 'smaa' },
  ],

  cinematicCold: [
    { effect: 'gtao', params: { radius: 0.3, blend: 0.9 } },
    { effect: 'bloom', params: { strength: 0.45, radius: 0.5, threshold: 0.95 } },
    {
      effect: 'colorGrading',
      params: { contrast: 1.22, saturation: 0.88, temperature: -0.32, tint: 0.08, gamma: 1.05 },
    },
    { effect: 'vignette', params: { offset: 0.85, darkness: 1.25 } },
    { effect: 'filmGrain', params: { intensity: 0.1, size: 1.1 } },
    { effect: 'smaa' },
  ],

  dream: [
    { effect: 'bloom', params: { strength: 1.4, radius: 1.1, threshold: 0.55 } },
    { effect: 'chromaticAberration', params: { amount: 0.0022 } },
    {
      effect: 'colorGrading',
      params: { contrast: 0.92, saturation: 1.18, lift: 0.07, gamma: 1.08, temperature: 0.12 },
    },
    { effect: 'vignette', params: { offset: 1.2, darkness: 0.7 } },
    { effect: 'smaa' },
  ],

  horror: [
    { effect: 'gtao', params: { radius: 0.45, blend: 1, distanceExponent: 1.4 } },
    {
      effect: 'colorGrading',
      params: { exposure: -0.55, contrast: 1.34, saturation: 0.55, temperature: -0.14, gamma: 1.1 },
    },
    { effect: 'sharpen', params: { amount: 0.4 } },
    { effect: 'vignette', params: { offset: 0.6, darkness: 1.9 } },
    { effect: 'filmGrain', params: { intensity: 0.42, size: 1.6 } },
    { effect: 'smaa' },
  ],

  cyberpunk: [
    { effect: 'bloom', params: { strength: 1.15, radius: 0.75, threshold: 0.7 } },
    { effect: 'chromaticAberration', params: { amount: 0.0035 } },
    {
      effect: 'colorGrading',
      params: { contrast: 1.24, saturation: 1.32, temperature: -0.3, tint: 0.26, lift: 0.03 },
    },
    { effect: 'vignette', params: { offset: 0.8, darkness: 1.3 } },
    { effect: 'filmGrain', params: { intensity: 0.1, size: 1 } },
    { effect: 'smaa' },
  ],

  vintageFilm: [
    // A low threshold with a small radius is halation — the glow an emulsion puts around a
    // highlight — rather than the wide bloom a lens gives.
    { effect: 'bloom', params: { strength: 0.4, radius: 0.25, threshold: 0.6 } },
    {
      effect: 'colorGrading',
      params: {
        contrast: 1.06,
        saturation: 0.76,
        temperature: 0.3,
        tint: 0.1,
        lift: 0.06,
        gamma: 1.12,
      },
    },
    { effect: 'vignette', params: { offset: 0.7, darkness: 1.5 } },
    { effect: 'filmGrain', params: { intensity: 0.48, size: 1.8 } },
    { effect: 'smaa' },
  ],

  productShot: [
    { effect: 'gtao', params: { radius: 0.15, blend: 0.6, samples: 24 } },
    { effect: 'bloom', params: { strength: 0.2, radius: 0.25, threshold: 1.05 } },
    { effect: 'colorGrading', params: { contrast: 1.1, saturation: 1.08, gain: 1.04 } },
    { effect: 'sharpen', params: { amount: 0.35 } },
    { effect: 'smaa' },
  ],

  game: [
    { effect: 'bloom', params: { strength: 0.7, radius: 0.45, threshold: 0.8 } },
    { effect: 'colorGrading', params: { contrast: 1.12, saturation: 1.1 } },
    { effect: 'vignette', params: { offset: 1, darkness: 0.8 } },
    // FXAA rather than SMAA: a game look is the one that buys its edges at the lowest price.
    { effect: 'fxaa' },
  ],
  /*
   * The eleven below are LOOKS of a game rather than of a camera, and the difference is the
   * anti-aliasing: half of them deliberately ship without any, because a hard pixel edge IS the
   * style. A PSX preset that smoothed its own dither would be a PSX preset of nothing.
   */

  /** Low resolution, few colours, ordered dither — and no AA, which is the whole point. */
  psx: [
    { effect: 'pixelate', params: { size: 4 } },
    { effect: 'posterize', params: { levels: 12 } },
    { effect: 'dither', params: { amount: 0.7, levels: 12 } },
    { effect: 'scanlines', params: { intensity: 0.12, count: 480 } },
  ],

  /** Four values through a green screen. `tint` towards green does what no LUT is needed for. */
  gameBoy: [
    { effect: 'pixelate', params: { size: 3 } },
    { effect: 'colorGrading', params: { saturation: 0.05, tint: -0.85, temperature: -0.2 } },
    { effect: 'posterize', params: { levels: 4 } },
    { effect: 'dither', params: { amount: 0.85, levels: 4 } },
  ],

  /** The cabinet: a curved tube, its scanlines and its glow. `crt` already carries the vignette. */
  arcade: [
    { effect: 'bloom', params: { strength: 0.5, radius: 0.5, threshold: 0.75 } },
    { effect: 'colorGrading', params: { saturation: 1.18, contrast: 1.1 } },
    {
      effect: 'crt',
      params: { curvature: 0.35, scanline: 0.45, aberration: 0.004, vignette: 0.5 },
    },
  ],

  /** The dash. `hole` is what keeps the subject at the centre readable through its own smear. */
  speedRush: [
    { effect: 'radialBlur', params: { amount: 0.35, hole: 0.18, samples: 20 } },
    { effect: 'chromaticAberration', params: { amount: 0.006 } },
    { effect: 'bloom', params: { strength: 0.5, radius: 0.6, threshold: 0.8 } },
    { effect: 'colorGrading', params: { contrast: 1.12, saturation: 1.08 } },
    { effect: 'vignette', params: { offset: 1.4, darkness: 1.4 } },
  ],

  /** Low health: the colour drains, the edges close in, the lens gives up. */
  damage: [
    { effect: 'blur', params: { radius: 0.8 } },
    { effect: 'chromaticAberration', params: { amount: 0.008 } },
    {
      effect: 'colorGrading',
      params: { saturation: 0.55, temperature: 0.35, contrast: 1.15, exposure: -0.3 },
    },
    { effect: 'filmGrain', params: { intensity: 0.35, size: 1.4 } },
    { effect: 'vignette', params: { offset: 1.8, darkness: 2.2 } },
  ],

  /** Amplified light through a green tube, and the noise that comes with amplifying it. */
  nightVision: [
    { effect: 'bloom', params: { strength: 0.9, radius: 0.7, threshold: 0.45 } },
    {
      effect: 'colorGrading',
      params: { exposure: 1.1, contrast: 1.3, saturation: 0.2, tint: -0.9 },
    },
    { effect: 'scanlines', params: { intensity: 0.22, count: 620 } },
    { effect: 'filmGrain', params: { intensity: 0.45, size: 1 } },
    { effect: 'vignette', params: { offset: 1.9, darkness: 2.4 } },
  ],

  /** Under the surface: the image wobbles, the light goes blue, the distance goes soft. */
  underwater: [
    { effect: 'heatHaze', params: { amount: 0.006, frequency: 12, speed: 0.8 } },
    { effect: 'blur', params: { radius: 0.9 } },
    {
      effect: 'colorGrading',
      params: { temperature: -0.55, tint: -0.15, saturation: 0.85, exposure: -0.25 },
    },
    { effect: 'vignette', params: { offset: 1.5, darkness: 1.6 } },
  ],

  /** Inked and screened, the way a printed page is: a line, flat colour, and a dot pattern. */
  comic: [
    { effect: 'posterize', params: { levels: 6 } },
    { effect: 'colorGrading', params: { saturation: 1.3, contrast: 1.18 } },
    { effect: 'outline', params: { thickness: 1.4, threshold: 0.08 } },
    { effect: 'halftone', params: { radius: 3, blending: 0.35 } },
  ],

  /** A thin line, a soft glow and lifted colour — cel shading read off the finished image. */
  anime: [
    { effect: 'outline', params: { thickness: 1, threshold: 0.12, opacity: 0.85 } },
    { effect: 'bloom', params: { strength: 0.7, radius: 0.6, threshold: 0.8 } },
    { effect: 'colorGrading', params: { saturation: 1.2, contrast: 1.05, vibrance: 0.25 } },
    { effect: 'smaa' },
  ],

  /** Kuwahara flattens the inside of every shape; the sharpen gives their borders back. */
  painterly: [
    { effect: 'kuwahara', params: { radius: 3 } },
    { effect: 'sharpen', params: { amount: 0.3 } },
    { effect: 'colorGrading', params: { saturation: 1.12, contrast: 1.06 } },
    { effect: 'vignette', params: { offset: 1.2, darkness: 1.1 } },
  ],

  /** No colour, hard contrast, and the bars that say a camera framed it. */
  noir: [
    {
      effect: 'colorGrading',
      params: { saturation: 0, contrast: 1.45, gamma: 0.95, lift: -0.02 },
    },
    { effect: 'filmGrain', params: { intensity: 0.35, size: 1.2 } },
    { effect: 'vignette', params: { offset: 1.6, darkness: 1.8 } },
    { effect: 'letterbox', params: { aspect: 2.39 } },
    { effect: 'smaa' },
  ],
}
export const POST_PRESET_IDS: readonly PostPresetId[] = Object.keys(
  POST_PRESETS,
) as readonly PostPresetId[]

export function isPostPresetId(value: unknown): value is PostPresetId {
  return typeof value === 'string' && value in POST_PRESETS
}

/**
 * A preset, as a stack ready to be put into a document.
 *
 * Every parameter is filled from the effect's own defaults and then overwritten by what the
 * recipe names — and each one goes through `boundParam`, so a recipe that drifted out of the
 * spec of an effect it uses is corrected rather than written into a document.
 */
export function stackFromPreset(id: PostPresetId, mintId: () => string): PostStack {
  return {
    enabled: true,
    effects: POST_PRESETS[id].map(step => ({
      ...postEffect(mintId(), step.effect),
      // `readParams` fills in from the catalogue and bounds what the recipe does say — a key the
      // recipe leaves out reaches `boundParam` as `undefined`, which is its own default.
      params: readParams(step.effect, step.params),
    })),
  }
}

/** What a preset the person saved on this machine holds. */
export type UserPostPreset = {
  id: string
  name: string
  stack: PostStack
}

/**
 * A saved look by its id OR by the name somebody gave it, theirs winning over a shipped one of
 * the same name — it is the one they made on purpose.
 *
 * Here rather than at each caller: the picker hands an id and a client hands a name, and a rule
 * written twice is a rule that drifts.
 */
export function postPresetNamed(
  saved: readonly UserPostPreset[],
  named: string,
): UserPostPreset | undefined {
  return saved.find(preset => preset.id === named || preset.name === named)
}

const POST_PRESET_FILE_TYPE = 'post-processing-preset'

/** Bumped when the shape below changes in a way an older reader cannot ignore. */
export const POST_PRESET_VERSION = 1

/**
 * The file two projects exchange a look through.
 *
 * It carries ids, switches and numbers — nothing that can be run. There is deliberately no room
 * in this shape for a shader, a script or a path: an effect is a member of `PostEffectId`, which
 * is code, so a file can only ever NAME one this build already has (§ 12).
 */
export type PostPresetFile = {
  type: typeof POST_PRESET_FILE_TYPE
  version: number
  name: string
  stack: PostStack
}

export function postPresetFile(name: string, stack: PostStack): PostPresetFile {
  return { type: POST_PRESET_FILE_TYPE, version: POST_PRESET_VERSION, name, stack }
}

export type PostPresetRead =
  | { ok: true; name: string; stack: PostStack; dropped: readonly string[] }
  | { ok: false; reason: 'shape' | 'version' }

/**
 * A preset file, read back.
 *
 * A version from the FUTURE is refused rather than guessed at; a version from the past is read
 * by the current reader, which fills every field it knows and ignores every field it does not.
 * Effects this build has no code for are dropped and NAMED, so the import can say what was lost
 * instead of quietly showing a different picture.
 */
export function readPostPresetFile(payload: unknown, mintId: () => string): PostPresetRead {
  if (!isRecord(payload) || payload.type !== POST_PRESET_FILE_TYPE)
    return { ok: false, reason: 'shape' }

  const version = payload.version
  if (typeof version !== 'number' || !Number.isFinite(version))
    return { ok: false, reason: 'shape' }
  if (version > POST_PRESET_VERSION) return { ok: false, reason: 'version' }

  return {
    ok: true,
    name: typeof payload.name === 'string' ? payload.name : '',
    stack: readStack(payload.stack, mintId),
    dropped: unknownEffectsIn(payload.stack),
  }
}

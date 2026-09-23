/**
 * How one knob of one effect is SHOWN, and the six shapes a fiche builds one with.
 *
 * Apart from the catalogue that uses them: `postProcessingRegistry` is the thirty fiches, this is
 * the vocabulary they are written in — and a file holding both went past what the size guard
 * allows for one module.
 */
import type { FieldValue, PropertySpec } from './propertySpec'

/** What a parameter holds. The same four shapes the inspector already renders. */
export type PostParamValue = FieldValue

/**
 * One knob of one effect: how it is shown, what it opens on, and whether the timeline may drive
 * it.
 *
 * A colour is `animatable: false` in this version — a keyframe carries a `Vector3` and a colour
 * is stored as a hexadecimal string, so keying one would need a conversion at both ends that
 * nothing yet asks for.
 */
export type PostParamSpec = PropertySpec & { default: PostParamValue; animatable: boolean }

export const slider = (
  min: number,
  max: number,
  step: number,
  value: number,
  animatable = true,
): PostParamSpec => ({ control: 'slider', min, max, step, default: value, animatable })

export const number = (min: number, max: number, step: number, value: number): PostParamSpec => ({
  control: 'number',
  min,
  max,
  step,
  default: value,
  animatable: true,
})

export const toggle = (value: boolean): PostParamSpec => ({
  control: 'toggle',
  default: value,
  animatable: false,
})

export const colour = (value: string): PostParamSpec => ({
  control: 'color',
  default: value,
  animatable: false,
})

export const choice = (options: readonly string[], value: string): PostParamSpec => ({
  control: 'choice',
  options,
  labelPrefix: 'postfx.option_',
  default: value,
  animatable: false,
})

export const picture = (value = ''): PostParamSpec => ({
  control: 'asset',
  assetType: 'image',
  default: value,
  animatable: false,
})

export const HALFTONE_SHAPES: readonly string[] = ['dot', 'ellipse', 'line', 'square']
export const BLUR_KINDS: readonly string[] = ['gaussian', 'box']

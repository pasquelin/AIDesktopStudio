/** Every effect that is a FUNCTION OF ONE PIXEL — six of them for one draw. See `fuseShader`. */
import { Vector2 } from 'three'
import { NEUTRAL_ADJUSTMENTS, adjustUniformsOf } from '@shared/domain/adjustments'
import type { PostEffect, PostEffectId } from '@shared/domain/postProcessing'
import type { FusableChunk, FusableKind } from '../fuseShader'
import type { ViewInfo } from '../effectInstance'
import { paramFlag, paramNumber, write, writeVector, type Uniforms } from '../uniforms'
import { PIVOT } from './postGlsl'

/** `apply` receives the uniforms under the effect's OWN names: a chunk never knows it merged. */
export type FusableEffect = {
  /** Whether it moves the coordinate before the single fetch, or works on the colour after it. */
  kind: FusableKind
  make: () => Omit<FusableChunk, 'kind'>
  apply: (effect: PostEffect, view: ViewInfo, uniforms: Uniforms) => void
}

/** Barrel and pincushion, and the zoom that puts the corners back inside the frame. */
const lensDistortion: FusableEffect = {
  kind: 'uv',
  make: () => ({
    uniforms: {
      distortion: { value: 0.1 },
      quartic: { value: 0 },
      zoom: { value: 1 },
      aspect: { value: 1 },
    },
    body: `
    vec2 centred = (uv - 0.5) / max(zoom, 0.001);
    vec2 scaled = vec2(centred.x * aspect, centred.y);
    float radius = dot(scaled, scaled);
    uv = centred * (1.0 + distortion * radius + quartic * radius * radius) + 0.5;
    mask *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'distortion', paramNumber(effect, 'distortion'))
    write(uniforms, 'quartic', paramNumber(effect, 'quartic'))
    write(uniforms, 'zoom', paramNumber(effect, 'zoom'))
    write(uniforms, 'aspect', view.height === 0 ? 1 : view.width / view.height)
  },
}

/** Blocks of `size` device pixels, snapped so the grid does not crawl when the view resizes. */
const pixelate: FusableEffect = {
  kind: 'uv',
  make: () => ({
    uniforms: { size: { value: 6 }, resolution: { value: new Vector2(1, 1) } },
    body: `
    vec2 blocks = max(resolution / max(size, 1.0), vec2(1.0));
    uv = (floor(uv * blocks) + 0.5) / blocks;
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'size', paramNumber(effect, 'size'))
    writeVector(uniforms, 'resolution', view.width, view.height)
  },
}

/**
 * 🛑 The five dials the studio already grades a sky and a layer with go through
 * `adjustUniformsOf` and wear the GLSL `gpu/passes/adjust` wears. `adjustments.ts` says a grading
 * contract written twice drifts — written a third time here, it had drifted on the tint gain.
 */
const colorGrading: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: {
      exposure: { value: 1 },
      contrast: { value: 1 },
      saturation: { value: 1 },
      temperature: { value: 0 },
      tint: { value: 0 },
      vibrance: { value: 0 },
      hue: { value: 0 },
      gamma: { value: 1 },
      lift: { value: 0 },
      gain: { value: 1 },
    },
    helpers: [
      `
    vec3 turnHue(vec3 source, float radians) {
      float c = cos(radians);
      float s = sin(radians);
      mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
      mat3 fromYiq = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
      vec3 yiq = toYiq * source;
      return fromYiq * vec3(yiq.x, yiq.y * c - yiq.z * s, yiq.y * s + yiq.z * c);
    }
    `,
    ],
    body: `
    colour *= exposure;
    colour.r *= 1.0 + temperature;
    colour.b *= 1.0 - temperature;
    colour.g *= 1.0 - tint;
    colour = max(colour * gain + lift, vec3(0.0));
    colour = pow(colour, vec3(1.0 / max(gamma, 0.001)));
    colour = max((colour - ${PIVOT}) * contrast + ${PIVOT}, vec3(0.0));
    float grey = dot(colour, LUMA);
    colour = mix(vec3(grey), colour, saturation);
    float peak = max(colour.r, max(colour.g, colour.b));
    float spread = peak - min(colour.r, min(colour.g, colour.b));
    colour = mix(vec3(grey), colour, 1.0 + vibrance * (1.0 - spread / max(peak, 0.0001)));
    colour = mix(colour, turnHue(colour, hue), step(0.0001, abs(hue)));
    `,
  }),
  apply: (effect, _view, uniforms) => {
    const shared = adjustUniformsOf({
      ...NEUTRAL_ADJUSTMENTS,
      exposure: paramNumber(effect, 'exposure'),
      contrast: paramNumber(effect, 'contrast'),
      saturation: paramNumber(effect, 'saturation'),
      temperature: paramNumber(effect, 'temperature'),
      tint: paramNumber(effect, 'tint'),
    })
    write(uniforms, 'exposure', shared.exposure)
    write(uniforms, 'contrast', shared.contrast)
    write(uniforms, 'saturation', shared.saturation)
    write(uniforms, 'temperature', shared.temperature)
    write(uniforms, 'tint', shared.tint)

    write(uniforms, 'vibrance', paramNumber(effect, 'vibrance'))
    // Degrees on the panel, radians in the shader: an angle a person types is in degrees.
    write(uniforms, 'hue', (paramNumber(effect, 'hue') * Math.PI) / 180)
    write(uniforms, 'gamma', paramNumber(effect, 'gamma'))
    write(uniforms, 'lift', paramNumber(effect, 'lift'))
    write(uniforms, 'gain', paramNumber(effect, 'gain'))
  },
}

const vignette: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: { offset: { value: 1 }, darkness: { value: 1 } },
    body: `
    vec2 corner = (vUv - 0.5) * vec2(offset);
    colour *= clamp(pow(clamp(1.0 - dot(corner, corner), 0.0, 1.0), darkness), 0.0, 1.0);
    `,
  }),
  apply: (effect, _view, uniforms) => {
    write(uniforms, 'offset', paramNumber(effect, 'offset'))
    write(uniforms, 'darkness', paramNumber(effect, 'darkness'))
  },
}

/** Quantised through a display transfer: linear steps put every band in the shadows. */
const posterize: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: { levels: { value: 8 } },
    body: `
    vec3 shown = pow(max(colour, vec3(0.0)), vec3(1.0 / 2.2));
    colour = pow(floor(shown * levels + 0.5) / levels, vec3(2.2));
    `,
  }),
  apply: (effect, _view, uniforms) => write(uniforms, 'levels', paramNumber(effect, 'levels')),
}

/** An ordered 4×4 Bayer dither — ordered rather than random, so it does not shimmer per frame. */
const dither: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: {
      amount: { value: 0.5 },
      levels: { value: 8 },
      resolution: { value: new Vector2(1, 1) },
    },
    helpers: [
      `
    float bayer(vec2 pixel) {
      vec2 cell = floor(pixel);
      float a = mod(cell.x, 2.0) + 2.0 * mod(cell.y, 2.0);
      float b = mod(floor(cell.x * 0.5), 2.0) + 2.0 * mod(floor(cell.y * 0.5), 2.0);
      return (a * 4.0 + b) / 16.0 - 0.5;
    }
    `,
    ],
    body: `
    vec3 shown = pow(max(colour, vec3(0.0)), vec3(1.0 / 2.2));
    vec3 noised = shown + bayer(vUv * resolution) * amount / levels;
    colour = pow(clamp(floor(noised * levels + 0.5) / levels, 0.0, 1.0), vec3(2.2));
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    write(uniforms, 'levels', paramNumber(effect, 'levels'))
    writeVector(uniforms, 'resolution', view.width, view.height)
  },
}

/** Strongest in the mid-tones, and moving: still grain reads as dirt on the sensor. */
const filmGrain: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: {
      intensity: { value: 0.3 },
      grainSize: { value: 1 },
      seed: { value: 0 },
      resolution: { value: new Vector2(1, 1) },
    },
    body: `
    vec2 grid = floor(vUv * resolution / max(grainSize, 0.001));
    float level = clamp(dot(colour, LUMA), 0.0, 1.0);
    colour += (hash(grid + seed) - 0.5) * intensity * 4.0 * level * (1.0 - level);
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'intensity', paramNumber(effect, 'intensity'))
    write(uniforms, 'grainSize', paramNumber(effect, 'size'))
    // Frozen where still grain was asked for: a still frame of a film has grain, it just does
    // not crawl.
    write(uniforms, 'seed', paramFlag(effect, 'animated') ? view.time % 1 : 0)
    writeVector(uniforms, 'resolution', view.width, view.height)
  },
}

/** Horizontal lines, COUNTED rather than measured in pixels: a look survives a resize. */
const scanlines: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: { intensity: { value: 0.3 }, count: { value: 720 } },
    body: `
    float line = sin(vUv.y * count * 3.14159265);
    colour *= 1.0 - intensity * 0.5 * (1.0 - line * line);
    `,
  }),
  apply: (effect, _view, uniforms) => {
    write(uniforms, 'intensity', paramNumber(effect, 'intensity'))
    write(uniforms, 'count', paramNumber(effect, 'count'))
  },
}

/** A rotated dot grid modulating the luminance — the newsprint screen, in one pixel's worth. */
const dotScreen: FusableEffect = {
  kind: 'colour',
  make: () => ({
    uniforms: {
      scale: { value: 0.8 },
      angle: { value: 1.57 },
      resolution: { value: new Vector2(1, 1) },
    },
    body: `
    vec2 at = (vUv - 0.5) * resolution * scale;
    float c = cos(angle);
    float s = sin(angle);
    vec2 turned = vec2(at.x * c - at.y * s, at.x * s + at.y * c);
    float pattern = sin(turned.x) * sin(turned.y);
    colour = vec3(clamp(dot(colour, LUMA) * 10.0 - 5.0 + pattern, 0.0, 1.0));
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'scale', paramNumber(effect, 'scale'))
    write(uniforms, 'angle', paramNumber(effect, 'angle'))
    writeVector(uniforms, 'resolution', view.width, view.height)
  },
}

/**
 * Rising air, a portal, under the water. A `uv` chunk, so the wobble costs nothing beyond the
 * single fetch the fused pass already makes — the picture moves, never the geometry.
 */
const heatHaze: FusableEffect = {
  kind: 'uv',
  make: () => ({
    uniforms: { amount: { value: 0.008 }, frequency: { value: 18 }, phase: { value: 0 } },
    body: `
    float wave = uv.y * frequency + phase;
    uv.x += sin(wave) * amount;
    uv.y += cos(wave * 0.7) * amount * 0.5;
    // Clamped rather than masked: air that shimmers must not paint the edges of the frame black.
    uv = clamp(uv, 0.0, 1.0);
    `,
  }),
  apply: (effect, view, uniforms) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    write(uniforms, 'frequency', paramNumber(effect, 'frequency'))
    write(uniforms, 'phase', view.time * paramNumber(effect, 'speed'))
  },
}

/**
 * Cinematic bars at the ratio a shot is framed for — and pillars rather than bars where the view
 * is WIDER than the ratio asked for, which is what makes 4:3 usable on a wide viewport.
 */
const letterbox: FusableEffect = {
  kind: 'colour',
  make: () => ({
    // Half the shown span on each axis, and the softness — all three are functions of the
    // parameters alone, so they are worked out once per image rather than once per pixel.
    uniforms: { shown: { value: new Vector2(0.5, 0.5) }, edge: { value: 0.0001 } },
    body: `
    colour *=
      (1.0 - smoothstep(shown.y - edge, shown.y + edge, abs(vUv.y - 0.5))) *
      (1.0 - smoothstep(shown.x - edge, shown.x + edge, abs(vUv.x - 0.5)));
    `,
  }),
  apply: (effect, view, uniforms) => {
    const aspect = Math.max(paramNumber(effect, 'aspect'), 0.001)
    const frame = view.height === 0 ? 1 : view.width / view.height
    writeVector(
      uniforms,
      'shown',
      Math.min(aspect / frame, 1) * 0.5,
      Math.min(frame / aspect, 1) * 0.5,
    )
    write(uniforms, 'edge', Math.max(paramNumber(effect, 'softness'), 0.0001))
  },
}

/**
 * `satisfies` rather than an annotation, so the KEYS stay literal — which is what lets the other
 * table be typed on `Exclude<PostEffectId, FusedId>` and hold the partition at compile time.
 */
const FUSABLE_EFFECTS = {
  lensDistortion,
  heatHaze,
  pixelate,
  colorGrading,
  vignette,
  letterbox,
  posterize,
  dither,
  filmGrain,
  scanlines,
  dotScreen,
} satisfies Partial<Record<PostEffectId, FusableEffect>>

export type FusedId = keyof typeof FUSABLE_EFFECTS

/** Widened for the two lookups that arrive with any id of the catalogue. */
const BY_ID: Partial<Record<PostEffectId, FusableEffect>> = FUSABLE_EFFECTS

export function fusableFor(id: PostEffectId): FusableEffect | undefined {
  return BY_ID[id]
}

/** Which half of a fused pass an effect belongs to, or `null` when it cannot fuse. */
export function fusableKind(effect: PostEffect): FusableKind | null {
  return BY_ID[effect.effect]?.kind ?? null
}

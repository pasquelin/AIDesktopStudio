/**
 * What a post-processing stack IS, and what every effect declares of itself.
 *
 * Data only, and deliberately: the catalogue is read by the renderer to build passes, by the MCP
 * registry to publish actions, and by the main process to validate an imported preset. None of
 * those may pull three.js in, so nothing here knows a `Pass` exists — `engines/postfx/` is the
 * one folder that does.
 */
import { BOTH_ENGINES, GL_ONLY, type RenderEngine } from './renderEngine'
import {
  BLUR_KINDS,
  HALFTONE_SHAPES,
  choice,
  colour,
  number,
  picture,
  slider,
  toggle,
  type PostParamSpec,
} from './postParamSpec'

export { HALFTONE_SHAPES, type PostParamSpec, type PostParamValue } from './postParamSpec'

export type PostCategory =
  'lighting' | 'lens' | 'light' | 'color' | 'image' | 'film' | 'stylized' | 'aa'

export const POST_CATEGORIES: readonly PostCategory[] = [
  'lighting',
  'lens',
  'light',
  'color',
  'image',
  'film',
  'stylized',
  'aa',
]

/**
 * Where an effect is allowed to sit in the chain, and it is not a preference.
 *
 * `render` DRAWS the scene and replaces the plain render at the head — supersampling, and nothing
 * else. `ao` reads the depth and the normals of that render and must darken the picture before
 * anything spreads light around it; a bloom applied first would bloom light the occlusion was
 * about to remove. `aa` reads finished pixels and comes after everything that could introduce an
 * edge. Only `image` is free, and that band is the one the drag reorders.
 *
 * **`render` and `ao` are EXCLUSIVE**: two passes each drawing the scene would draw it twice to
 * throw one away, and two occlusions multiply into a picture nobody asked for.
 */
export type PostSlot = 'render' | 'ao' | 'image' | 'aa'

export const SLOT_RANK: Record<PostSlot, number> = { render: 0, ao: 1, image: 2, aa: 3 }

/** The slots of which at most one is honoured — see `planStack`. */
export const EXCLUSIVE: readonly PostSlot[] = ['render', 'ao']

/** Roughly what a pass costs, for the badge the library shows. Never used to decide anything. */
export type PostCost = 'low' | 'medium' | 'high'

export const POST_COSTS: readonly PostCost[] = ['low', 'medium', 'high']

export type PostEffectId =
  | 'gtao'
  | 'ssao'
  | 'ssaa'
  | 'bloom'
  | 'dof'
  | 'chromaticAberration'
  | 'lensDistortion'
  | 'heatHaze'
  | 'colorGrading'
  | 'lut'
  | 'sharpen'
  | 'blur'
  | 'radialBlur'
  | 'pixelate'
  | 'posterize'
  | 'dither'
  | 'vignette'
  | 'letterbox'
  | 'filmGrain'
  | 'scanlines'
  | 'outline'
  | 'halftone'
  | 'dotScreen'
  | 'kuwahara'
  | 'glitch'
  | 'rgbShift'
  | 'crt'
  | 'vhs'
  | 'fxaa'
  | 'smaa'

export type PostEffectMeta = {
  category: PostCategory
  cost: PostCost
  slot: PostSlot
  /**
   * Which engines can actually build it. The SLOT is the same on both sides — a GPU occlusion
   * occupies the `ao` slot its GL twin occupies, and the exclusivity rule holds unchanged — so
   * this says nothing about where an effect sits in the chain, only about who can make one.
   */
  engines: readonly RenderEngine[]
  /** Whether two of them in one stack mean anything. An anti-aliaser twice does not. */
  duplicable: boolean
  /**
   * Whether it works ABOVE white — a bloom thresholds highlights, a defocus spreads them, an
   * opened exposure pulls values back from over one. On bytes all three read as clipping, so the
   * chain buys half-float for them. Declared here rather than named in the renderer: a thirtieth
   * HDR effect would otherwise draw into bytes and nothing would redden.
   */
  hdr?: boolean
  params: Readonly<Record<string, PostParamSpec>>
}

/**
 * Every effect the studio knows, and everything a panel needs to draw one.
 *
 * A `Record` keyed on the union, so an effect added to `PostEffectId` fails to compile until it
 * has a fiche here — the same door `COVERAGE` holds for the MCP actions.
 */
export const POST_EFFECTS: Record<PostEffectId, PostEffectMeta> = {
  gtao: {
    category: 'lighting',
    cost: 'high',
    slot: 'ao',
    // The one effect both engines build: GLSL `GTAOPass` on the Compatible side, the native
    // `ao()` node on the Advanced one. Same slot, same exclusivity, same parameters.
    engines: BOTH_ENGINES,
    duplicable: false,
    params: {
      radius: slider(0.01, 2, 0.01, 0.25),
      distanceExponent: slider(0.5, 4, 0.1, 1),
      thickness: slider(0.1, 10, 0.1, 1),
      scale: slider(0.01, 4, 0.01, 1),
      samples: number(4, 32, 1, 16),
      blend: slider(0, 1, 0.01, 1),
    },
  },
  ssao: {
    category: 'lighting',
    cost: 'high',
    slot: 'ao',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      radius: slider(0.01, 32, 0.01, 8),
      minDistance: slider(0.0001, 0.02, 0.0001, 0.005),
      maxDistance: slider(0.01, 0.5, 0.01, 0.1),
    },
  },
  ssaa: {
    category: 'aa',
    cost: 'high',
    slot: 'render',
    engines: GL_ONLY,
    duplicable: false,
    params: { level: number(1, 4, 1, 2) },
  },
  bloom: {
    hdr: true,
    category: 'light',
    cost: 'medium',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      strength: slider(0, 4, 0.01, 0.6),
      radius: slider(0, 2, 0.01, 0.4),
      threshold: slider(0, 2, 0.01, 0.85),
    },
  },
  dof: {
    hdr: true,
    category: 'lens',
    cost: 'high',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      focusDistance: number(0.01, 1000, 0.01, 10),
      aperture: slider(0.0001, 0.05, 0.0001, 0.005),
      maxBlur: slider(0, 0.05, 0.001, 0.01),
    },
  },
  chromaticAberration: {
    category: 'lens',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      amount: slider(0, 0.05, 0.0005, 0.003),
      radial: toggle(true),
    },
  },
  lensDistortion: {
    category: 'lens',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      distortion: slider(-0.5, 0.5, 0.005, 0.1),
      quartic: slider(-0.5, 0.5, 0.005, 0),
      zoom: slider(0.5, 1.5, 0.01, 1),
    },
  },
  /** Rising air, a portal, under the water: the picture wobbles rather than the geometry. */
  heatHaze: {
    category: 'lens',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      amount: slider(0, 0.05, 0.001, 0.008),
      frequency: slider(1, 60, 0.5, 18),
      speed: slider(0, 8, 0.1, 1.4),
    },
  },
  colorGrading: {
    hdr: true,
    category: 'color',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      exposure: slider(-4, 4, 0.01, 0),
      contrast: slider(0, 2, 0.01, 1),
      saturation: slider(0, 2, 0.01, 1),
      vibrance: slider(-1, 1, 0.01, 0),
      temperature: slider(-1, 1, 0.01, 0),
      tint: slider(-1, 1, 0.01, 0),
      hue: slider(-180, 180, 1, 0),
      gamma: slider(0.1, 3, 0.01, 1),
      lift: slider(-0.5, 0.5, 0.01, 0),
      gain: slider(0, 2, 0.01, 1),
    },
  },
  lut: {
    category: 'color',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      texture: picture(),
      intensity: slider(0, 1, 0.01, 1),
    },
  },
  sharpen: {
    category: 'image',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: { amount: slider(0, 3, 0.01, 0.5) },
  },
  blur: {
    category: 'image',
    cost: 'medium',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      kind: choice(BLUR_KINDS, 'gaussian'),
      radius: slider(0, 8, 0.1, 2),
    },
  },
  /** The dash, the boost, the hit: everything smears towards a point. `centre` is where. */
  radialBlur: {
    category: 'image',
    cost: 'medium',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      amount: slider(0, 1, 0.01, 0.25),
      centreX: slider(0, 1, 0.01, 0.5),
      centreY: slider(0, 1, 0.01, 0.5),
      /** Where the smear STARTS, so a subject at the centre can stay readable through it. */
      hole: slider(0, 1, 0.01, 0.1),
      samples: number(4, 32, 1, 16),
    },
  },
  pixelate: {
    category: 'image',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: { size: number(1, 64, 1, 6) },
  },
  posterize: {
    category: 'image',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: { levels: number(2, 64, 1, 8) },
  },
  dither: {
    category: 'image',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: { amount: slider(0, 1, 0.01, 0.5), levels: number(2, 32, 1, 8) },
  },
  vignette: {
    category: 'film',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      offset: slider(0, 3, 0.01, 1),
      darkness: slider(0, 3, 0.01, 1),
    },
  },
  /** Cinematic bars, at the ratio a shot is framed for. Both axes: 4:3 on a wide view pillars. */
  letterbox: {
    category: 'film',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      aspect: slider(1, 3, 0.01, 2.39),
      softness: slider(0, 0.05, 0.001, 0),
    },
  },
  filmGrain: {
    category: 'film',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      intensity: slider(0, 1, 0.01, 0.3),
      size: slider(0.5, 4, 0.1, 1),
      /** Grain that stands still reads as dirt on the lens; grain that moves reads as film. */
      animated: toggle(true),
    },
  },
  scanlines: {
    category: 'film',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      intensity: slider(0, 1, 0.01, 0.3),
      count: number(64, 4096, 1, 720),
    },
  },
  outline: {
    category: 'stylized',
    cost: 'medium',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      thickness: slider(0.5, 4, 0.1, 1),
      threshold: slider(0, 1, 0.005, 0.1),
      colour: colour('#000000'),
      opacity: slider(0, 1, 0.01, 1),
    },
  },
  halftone: {
    category: 'stylized',
    cost: 'medium',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      shape: choice(HALFTONE_SHAPES, 'dot'),
      radius: slider(1, 20, 0.5, 4),
      scatter: slider(0, 1, 0.01, 0),
      blending: slider(0, 1, 0.01, 1),
    },
  },
  dotScreen: {
    category: 'stylized',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      scale: slider(0.1, 4, 0.05, 0.8),
      angle: slider(0, 6.28, 0.01, 1.57),
    },
  },
  /** The painterly filter: each pixel takes the mean of whichever quadrant varies least. */
  kuwahara: {
    category: 'stylized',
    cost: 'high',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: { radius: number(1, 6, 1, 3) },
  },
  glitch: {
    category: 'stylized',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: { wild: toggle(false) },
  },
  rgbShift: {
    category: 'stylized',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: true,
    params: {
      amount: slider(0, 0.05, 0.0005, 0.0015),
      angle: slider(0, 6.28, 0.01, 0),
    },
  },
  crt: {
    category: 'stylized',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      curvature: slider(0, 1, 0.01, 0.25),
      scanline: slider(0, 1, 0.01, 0.3),
      aberration: slider(0, 0.02, 0.0005, 0.002),
      vignette: slider(0, 1, 0.01, 0.4),
    },
  },
  vhs: {
    category: 'stylized',
    cost: 'low',
    slot: 'image',
    engines: GL_ONLY,
    duplicable: false,
    params: {
      bleed: slider(0, 0.05, 0.0005, 0.006),
      jitter: slider(0, 0.05, 0.0005, 0.004),
      noise: slider(0, 1, 0.01, 0.15),
      bands: slider(0, 1, 0.01, 0.3),
    },
  },
  fxaa: {
    category: 'aa',
    cost: 'low',
    slot: 'aa',
    engines: GL_ONLY,
    duplicable: false,
    params: {},
  },
  smaa: {
    category: 'aa',
    cost: 'medium',
    slot: 'aa',
    engines: GL_ONLY,
    duplicable: false,
    params: {},
  },
}

export const POST_EFFECT_IDS: readonly PostEffectId[] = Object.keys(
  POST_EFFECTS,
) as readonly PostEffectId[]

export function isPostEffectId(value: unknown): value is PostEffectId {
  return typeof value === 'string' && value in POST_EFFECTS
}

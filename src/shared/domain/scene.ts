import type { FontRef } from './font'
import { EMPTY_STACK, type PostStack } from './postProcessing'
import { RELIEF_CHUNK_TEXELS } from './relief'
import type { Vector3 } from './transform'
import type { GeometryDescriptor } from './geometry'
import {
  UNLOCKED_TERRAIN,
  GROUND_MATERIAL_CHANNELS,
  type ReliefLayer,
  type ScatterLayer,
  type TerrainEditLayer,
  type TextureRef,
  type WorldLayer,
} from './sceneModel'
import type { TextureSlot } from './sceneTexture'

export * from './sceneModel'
export * from './sceneTexture'
export * from './scatter'
export type { ReliefMask } from './relief'

export type EnvironmentRef =
  { kind: 'studio' } | { kind: 'skybox'; assetId: string } | { kind: 'sky'; documentId: string }

export const STUDIO_ENVIRONMENT: EnvironmentRef = Object.freeze({ kind: 'studio' })

export const ENVIRONMENT_KINDS: readonly EnvironmentRef['kind'][] = ['studio', 'skybox', 'sky']

/**
 * The ready-made worlds a scene can be set up as. Only the names live here — what each one WRITES
 * is a patch of `SceneWorld` the engine holds, and it needs a comparison the window owns.
 */
export type EnvironmentPreset = 'neutral' | 'studio' | 'product' | 'outdoor' | 'night'

export const ENVIRONMENT_PRESETS: readonly EnvironmentPreset[] = [
  'neutral',
  'studio',
  'product',
  'outdoor',
  'night',
]

/**
 * What a stored value says about lighting, or the studio when it says nothing usable — a
 * document written before environments existed, a sky named without an id, a hand-edited file.
 */
export function readEnvironment(value: unknown): EnvironmentRef {
  if (typeof value !== 'object' || value === null) return STUDIO_ENVIRONMENT

  const held: { kind?: unknown; assetId?: unknown; documentId?: unknown } = value
  if (held.kind === 'sky' && typeof held.documentId === 'string' && held.documentId !== '') {
    return { kind: 'sky', documentId: held.documentId }
  }

  return held.kind === 'skybox' && typeof held.assetId === 'string' && held.assetId !== ''
    ? { kind: 'skybox', assetId: held.assetId }
    : STUDIO_ENVIRONMENT
}

/**
 * What hangs behind the scene. `environment` is what every document written so far describes: the
 * sky when one is chosen, the studio's own backdrop token otherwise.
 *
 * `transparent` keeps nothing behind the subject, which is what a capture laid over something
 * else needs — the montage already renders that way, through a path of its own.
 */
export type BackgroundDescriptor =
  | {
      kind: 'environment'
      /**
       * `scene.backgroundBlurriness`, 0 to 1. Softens the PICTURE alone: what the materials
       * reflect goes on being read from the sharp map, which is what lets a sky serve as a
       * backdrop without turning every specular into a smear.
       */
      blur: number
    }
  | { kind: 'color'; color: string }
  | { kind: 'transparent' }

export const DEFAULT_BACKGROUND: BackgroundDescriptor = Object.freeze({
  kind: 'environment',
  blur: 0,
})

/** Derived, never restated: a fourth shape above is a fourth button on the spot. */
export const BACKGROUND_KINDS: readonly BackgroundDescriptor['kind'][] = [
  'environment',
  'color',
  'transparent',
]

/**
 * Distance haze. `linear` fades between two distances, `exp2` thickens with depth — three.js's
 * `Fog` and `FogExp2`, named as a person would rather than as the library spells them.
 */
export type FogDescriptor =
  | { kind: 'none' }
  | { kind: 'linear'; color: string; near: number; far: number }
  | { kind: 'exp2'; color: string; density: number }

type LinearFog = Extract<FogDescriptor, { kind: 'linear' }>
type Exp2Fog = Extract<FogDescriptor, { kind: 'exp2' }>

export const FOG_KINDS: readonly FogDescriptor['kind'][] = ['none', 'linear', 'exp2']

export const NO_FOG: FogDescriptor = Object.freeze({ kind: 'none' })

/** What a fog gains when it is first turned on, so the two forms open on something visible. */
export const DEFAULT_LINEAR_FOG: LinearFog = Object.freeze({
  kind: 'linear',
  color: '#9aa4b2',
  near: 10,
  far: 60,
})

export const DEFAULT_EXP2_FOG: Exp2Fog = Object.freeze({
  kind: 'exp2',
  color: '#9aa4b2',
  density: 0.02,
})

/**
 * How high dynamic range is brought down to a screen. The five three.js 0.185 actually maps —
 * a sixth word here would be a control that changes nothing.
 */
export type ToneMapping = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces'

export const TONE_MAPPINGS: readonly ToneMapping[] = [
  'none',
  'linear',
  'reinhard',
  'cineon',
  'aces',
]

/**
 * A ground plane the scene owns — an object shadows land on, never the viewport's grid. The two
 * are deliberately separate: one is what the scene IS, the other is how it is being looked at.
 */
export type GroundDescriptor = {
  visible: boolean
  /** `null` is the studio's own colour, resolved from the palette like a mesh's. */
  color: string | null
  /** Side of the square, in scene units. */
  size: number
  opacity: number
  receiveShadow: boolean
}

export const DEFAULT_GROUND: GroundDescriptor = Object.freeze({
  visible: false,
  color: null,
  size: 20,
  opacity: 1,
  receiveShadow: true,
})

/** A file that omits the placement: min corner at the world origin, side of the default ground. */
export const DEFAULT_RELIEF_ORIGIN: ReliefLayer['origin'] = Object.freeze({ x: 0, z: 0 })
export const DEFAULT_RELIEF_SIZE: ReliefLayer['size'] = Object.freeze({
  x: DEFAULT_GROUND.size,
  z: DEFAULT_GROUND.size,
})
export const DEFAULT_RELIEF_ELEVATION: ReliefLayer['elevation'] = Object.freeze({
  min: 0,
  max: 1,
})
export const DEFAULT_RELIEF_NAME = 'Terrain'
export const DEFAULT_EDIT_NAME = 'Sculpt'
/** Measured at 12/16 fragment samplers with IBL and one shadow on Apple M2 Max, 2026-09-04. */
export const MAX_GROUND_MATERIALS = GROUND_MATERIAL_CHANNELS.length

export function terrainEditLayer(
  patch: Partial<TerrainEditLayer> & { id: string },
): TerrainEditLayer {
  return {
    id: patch.id,
    name: patch.name ?? DEFAULT_EDIT_NAME,
    enabled: patch.enabled ?? true,
    locked: patch.locked ?? false,
    alpha: patch.alpha ?? 1,
    ...(patch.sculpt && patch.sculpt.chunks.length > 0 ? { sculpt: patch.sculpt } : {}),
    ...(patch.mask ? { mask: patch.mask } : {}),
  }
}

export function enabledTerrains(layers: readonly WorldLayer[]): readonly ReliefLayer[] {
  return layers.filter((layer): layer is ReliefLayer => layer.kind === 'relief' && layer.enabled)
}

export function enabledScatters(layers: readonly WorldLayer[]): readonly ScatterLayer[] {
  return layers.filter((layer): layer is ScatterLayer => layer.kind === 'scatter' && layer.enabled)
}

export function reliefLayer(
  heightmap: TextureRef,
  patch: Partial<Omit<ReliefLayer, 'kind' | 'heightmap'>> & { id: string },
): ReliefLayer {
  return {
    kind: 'relief',
    id: patch.id,
    name: patch.name ?? DEFAULT_RELIEF_NAME,
    enabled: patch.enabled ?? true,
    locked: patch.locked ?? UNLOCKED_TERRAIN,
    heightmap,
    origin: patch.origin ?? DEFAULT_RELIEF_ORIGIN,
    size: patch.size ?? DEFAULT_RELIEF_SIZE,
    elevation: patch.elevation ?? DEFAULT_RELIEF_ELEVATION,
    grain: patch.grain ?? RELIEF_CHUNK_TEXELS,
    edits: patch.edits ?? [],
    groundMaterials: (patch.groundMaterials ?? []).slice(0, MAX_GROUND_MATERIALS),
    groundWeights: patch.groundWeights ?? null,
  }
}

/**
 * How a scene is WALKED rather than watched — what the window that plays a set will fly, and
 * what a template settles for it.
 *
 * Nothing reads it today, and that is deliberate (decision of 20/08): these are document values,
 * so a template that means « first person, feet on the ground » has to be able to say so before
 * the player exists. Added later, every scene written until then would open on a default nobody
 * chose, and a template's intent would be lost.
 */
export type PlayCamera = 'orbit' | 'firstPerson' | 'thirdPerson' | 'topDown'

export const PLAY_CAMERAS: readonly PlayCamera[] = [
  'orbit',
  'firstPerson',
  'thirdPerson',
  'topDown',
]

export type ScenePlay = {
  camera: PlayCamera
  /** Metres above the floor: the eye in first person, the pivot the camera holds in the others. */
  eyeHeight: number
  /** Metres per second, on the flat. */
  moveSpeed: number
  /** Metres per second squared, downward. Zero flies — which is what `orbit` means here. */
  gravity: number
}

export const DEFAULT_PLAY: ScenePlay = Object.freeze({
  camera: 'orbit',
  eyeHeight: 1.7,
  moveSpeed: 4,
  gravity: 0,
})

/** Bounds a stored value is held to, so a hand-edited file cannot fly a set at Mach 3. */
export const EYE_HEIGHT = Object.freeze({ min: 0.1, max: 10, step: 0.05 })
export const MOVE_SPEED = Object.freeze({ min: 0.1, max: 50, step: 0.1 })
export const GRAVITY = Object.freeze({ min: 0, max: 50, step: 0.01 })

/**
 * What lights a scene and what hangs behind it — the half of a document that belongs to no node.
 *
 * Every default below is what the studio already did before this type existed, so opening a
 * document written without it changes nothing on screen.
 */
export type SceneWorld = {
  environment: EnvironmentRef
  /** Multiplies both what the environment lights with and what it draws behind the scene. */
  envIntensity: number
  /** Radians around the vertical axis. Turns the picture and the reflections together. */
  envRotation: number
  background: BackgroundDescriptor
  fog: FogDescriptor
  toneMapping: ToneMapping
  /** `renderer.toneMappingExposure`. Read even when the mapping is `none`, as three.js does. */
  exposure: number
  ground: GroundDescriptor
  play: ScenePlay
  /**
   * The scene's Default Post Processing — what the viewport shows, and what every camera films
   * through unless it says otherwise. Part of the document like the fog, and belonging to no node.
   */
  post: PostStack
  /** Surface patches. World opens with the scene; a file that omits them reads as none. */
  layers: readonly WorldLayer[]
}

export const DEFAULT_WORLD: SceneWorld = Object.freeze({
  environment: STUDIO_ENVIRONMENT,
  envIntensity: 1,
  envRotation: 0,
  background: DEFAULT_BACKGROUND,
  fog: NO_FOG,
  // `none` and not `aces`: the 3D viewport has always drawn without tone mapping, and turning it
  // on here would change how every existing project lands.
  toneMapping: 'none',
  exposure: 1,
  ground: DEFAULT_GROUND,
  play: DEFAULT_PLAY,
  // Empty and ON: a scene opens composing nothing, and the switch is already where a first
  // effect will be compared from.
  post: EMPTY_STACK,
  layers: Object.freeze([]),
})

/** Bounds a slider and a stored value are both held to. */
export const ENV_INTENSITY = Object.freeze({ min: 0, max: 3, step: 0.05 })
/** `scene.backgroundBlurriness` takes 0 to 1 and clamps past it, so the bounds are the API's. */
export const BACKGROUND_BLUR = Object.freeze({ min: 0, max: 1, step: 0.05 })
export const EXPOSURE = Object.freeze({ min: 0, max: 3, step: 0.05 })
export const GROUND_SIZE = Object.freeze({ min: 1, max: 500, step: 1 })
export const FOG_DENSITY = Object.freeze({ min: 0.001, max: 0.2, step: 0.001 })

/**
 * How soft a shadow edge is, named as a person would rather than as three.js spells it — the
 * engine maps these onto its map types. Here because it is persisted, and `shared/` is where
 * what a settings file holds is described.
 *
 * Two words and not three: three.js 0.185 deprecated its softest filter and silently falls back
 * to the middle one, so a third option would have been a setting that changes nothing.
 */
export type ShadowQuality = 'hard' | 'soft'

export const SHADOW_QUALITIES: readonly ShadowQuality[] = ['hard', 'soft']

/** The sides a shadow map may take. A list, so a slider cannot suggest the values in between. */
export const SHADOW_MAP_SIZES: readonly number[] = [512, 1024, 2048, 4096]

export type MaterialDescriptor = {
  kind: 'standard'
  /** `null` means the studio's own colour, resolved from the palette when the mesh is built. */
  color: string | null
  roughness: number
  metalness: number
  /**
   * How many times the maps repeat per METRE, not across the whole shape: 1 puts one square of
   * the working checker on every square metre, of a forty-metre floor as of a three-metre wall.
   *
   * A count across the shape was the first design and it could not hold — one number over UVs
   * that run 0..1 whatever the face measures gives 1 m per square along a 40 m band and 0,4 m
   * across the 16 m one, so two halves of one floor read as two different textures.
   *
   * Carried by the material and applied to the GEOMETRY's UVs rather than to the texture: the
   * engine shares one `Texture` between every mesh wearing it, so a repeat set there would
   * follow that picture everywhere it is used. Baked UVs also travel as plain glTF, which any
   * reader understands without an extension.
   */
  tilesPerMetre: number
} & { [S in TextureSlot]: TextureRef | null }

/**
 * Bounds the field and a hand-edited file alike — and the reading CLAMPS to them rather than
 * only checking the number is finite: zero collapses every UV onto one texel, which reads as a
 * mesh painted in a single flat colour with no way to tell why.
 */
export const TILES_PER_METRE = Object.freeze({ min: 0.05, max: 20, step: 0.05 })

/**
 * A sprite: a picture that always faces the camera, whatever the view does.
 *
 * Not a geometry and not a material — nothing about it is three-dimensional, and it is lit by
 * nothing — which is why it is a node of its own rather than a mesh wearing a plane. Its size
 * is its transform's scale, like everything else in the scene.
 */
export type SpriteDescriptor = {
  /** `null` means the studio's own colour, resolved from the palette when the sprite is built. */
  color: string | null
  opacity: number
  /** What it draws. None leaves the plain coloured quad three.js gives a mapless sprite. */
  map: TextureRef | null
}

/**
 * Words, as a solid. The typeface is a reference like a texture or a model is, and for the same
 * reason: what a document stores has to be something a reload can resolve again — see
 * `domain/font`, which both workspaces that set text read.
 *
 * The face itself is never stored. A shipped one is a name the studio can always answer, and an
 * installed one is a name only that machine can — which is the missing-font hole, said out loud
 * rather than papered over by embedding half a megabyte of glyph tables in every scene file.
 */
export type TextDescriptor = {
  value: string
  font: FontRef
  /** Height of the em square, in scene units. A capital stands about seven tenths of it. */
  size: number
  /** How far the letters stand out of their own plane. Zero leaves them flat. */
  depth: number
  /** How finely the curves are cut. The cost of a letter is mostly here. */
  curveSegments: number
}

/**
 * `target` is a point, not an object. three.js aims a light at an `Object3D`, and the official
 * editor shows that object in its outliner — but a node that cannot be renamed, hidden or
 * deleted is a property that leaked into the tree, and it doubles the length of a lit scene.
 */
export type LightDescriptor =
  | { kind: 'ambient'; color: string; intensity: number }
  | { kind: 'directional'; color: string; intensity: number; target: Vector3 }
  | { kind: 'hemisphere'; skyColor: string; groundColor: string; intensity: number }
  | { kind: 'point'; color: string; intensity: number; distance: number; decay: number }
  | {
      kind: 'spot'
      color: string
      intensity: number
      distance: number
      angle: number
      penumbra: number
      decay: number
      target: Vector3
    }

export type MeshKind = GeometryDescriptor['kind']

export type LightKind = LightDescriptor['kind']

/**
 * An offered kind. The label is not carried: it is `<namespace>.<kind>` in both bundles, and a
 * copy of that string per entry is 22 chances to mistype what nothing would catch.
 */
export type SceneEntry<K> = {
  kind: K
  /** Declared but not buildable yet: shown greyed, so no menu hides what is coming. */
  disabled?: boolean
}

/**
 * Order taken from `three.js/editor/js/Menubar.Add.js`, which is alphabetical in English and
 * kept that way: a stable order across languages beats a sort that moves entries when the
 * language changes.
 */
export const MESH_ENTRIES: readonly SceneEntry<MeshKind>[] = [
  { kind: 'box' },
  { kind: 'capsule' },
  { kind: 'circle' },
  { kind: 'cylinder' },
  { kind: 'dodecahedron' },
  { kind: 'icosahedron' },
  { kind: 'lathe' },
  { kind: 'octahedron' },
  { kind: 'plane' },
  { kind: 'ribbon' },
  { kind: 'ring' },
  { kind: 'sphere' },
  { kind: 'tetrahedron' },
  { kind: 'torus' },
  { kind: 'torusKnot' },
  { kind: 'tube' },
]

/**
 * The files a scene can leave the studio as. `glb` is one binary file and the safe default;
 * `gltf` is its JSON form, readable and diffable; `usdz` is what Apple's viewers open.
 */
export type ExportFormat = 'glb' | 'gltf' | 'usdz' | 'obj' | 'ply' | 'stl'

export const EXPORT_FORMATS: readonly ExportFormat[] = ['glb', 'gltf', 'usdz', 'obj', 'ply', 'stl']

/** What is picked from the Add menu without being a mesh or a light. */
export type ObjectKind = 'sprite' | 'text' | 'camera' | 'path' | 'player'

export const OBJECT_ENTRIES: readonly SceneEntry<ObjectKind>[] = [
  { kind: 'sprite' },
  { kind: 'text' },
  { kind: 'camera' },
  { kind: 'path' },
  { kind: 'player' },
]

/**
 * A figure is a SET of meshes, never one shape: a silhouette wearing clothes needs a colour per
 * part, and a node carries a single material. What the studio lays down is real mesh nodes an
 * author can then edit one by one — see `figures.ts`.
 */
export type FigureKind = 'humanoid'

export const FIGURE_ENTRIES: readonly SceneEntry<FigureKind>[] = [{ kind: 'humanoid' }]

export const LIGHT_ENTRIES: readonly SceneEntry<LightKind>[] = [
  { kind: 'ambient' },
  { kind: 'directional' },
  { kind: 'hemisphere' },
  { kind: 'point' },
  { kind: 'spot' },
]

export * from './sceneViewport'

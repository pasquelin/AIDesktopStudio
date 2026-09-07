/**
 * The half of a scene document that belongs to no node — what lights it, what hangs behind it,
 * how it is brought down to a screen — as a saved file writes and reads it.
 *
 * Apart from `sceneDocument.ts`, which reads the NODES: the two answer different questions and
 * only one of them has to walk a spec table per primitive.
 */
import {
  BACKGROUND_BLUR,
  DEFAULT_BACKGROUND,
  DEFAULT_EXP2_FOG,
  DEFAULT_GROUND,
  DEFAULT_LINEAR_FOG,
  DEFAULT_PLAY,
  DEFAULT_EDIT_NAME,
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_NAME,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
  DEFAULT_SCATTER_NAME,
  DEFAULT_SCATTER_RULES,
  DEFAULT_WORLD,
  ENV_INTENSITY,
  EXPOSURE,
  EYE_HEIGHT,
  FOG_DENSITY,
  GRAVITY,
  GROUND_MATERIAL_CHANNELS,
  GROUND_SIZE,
  MOVE_SPEED,
  NO_FOG,
  PLAY_CAMERAS,
  readEnvironment,
  reliefLayer,
  scatterLayer,
  SCATTER_ALTITUDE,
  SCATTER_CATEGORIES,
  SCATTER_DENSITY,
  SCATTER_FOLLOW_RELIEF,
  SCATTER_SCALE,
  SCATTER_SLOPE,
  SCATTER_SLOPE_ALIGN,
  SCATTER_SPACING,
  SCATTER_TILT,
  STUDIO_ENVIRONMENT,
  TONE_MAPPINGS,
  type BackgroundDescriptor,
  type EnvironmentRef,
  type FogDescriptor,
  type GroundDescriptor,
  type GroundMaterialLayer,
  type ReliefLayer,
  type ScatterAsset,
  type ScatterLayer,
  type ScatterRules,
  type ScenePlay,
  type SceneWorld,
  type TerrainEditLayer,
  type TerrainLocks,
  type TextureRef,
  type WorldLayer,
  terrainEditLayer,
  UNLOCKED_TERRAIN,
} from '@shared/domain/scene'
import { readStack } from '@shared/domain/postProcessing'
import { readReliefGrain, readReliefMask, readReliefSculpt } from '@shared/domain/relief'
import {
  isRecord,
  oneOf,
  readBoolean,
  readNumber,
  readOptionalNumber,
  readPositive,
  readString,
} from '@shared/guards'
import { newId } from '@/helpers/ids'
import { bound, type NumericBounds } from '@shared/numeric'

/**
 * What a stored value says about the world, filled in from the defaults wherever it says nothing
 * usable.
 *
 * `legacyEnvironment` is where the sky lived until this type existed — at the root of the payload
 * rather than in here. Every document written so far spells it that way, and reading it is the
 * whole of the migration: nothing is rewritten until the next save.
 */
export function readWorld(value: unknown, legacyEnvironment: unknown): SceneWorld {
  const held = isRecord(value) ? value : {}

  return {
    // The nested one wins when it is there; a file that only has the old root key keeps its sky.
    environment: readEnvironment('environment' in held ? held.environment : legacyEnvironment),
    envIntensity: readBounded(held, 'envIntensity', DEFAULT_WORLD.envIntensity, ENV_INTENSITY),
    // Unbounded on purpose: an angle wraps, so no value of it is wrong.
    envRotation: readNumber(held, 'envRotation', DEFAULT_WORLD.envRotation),
    background: readBackground(held.background),
    fog: readFog(held.fog),
    toneMapping: oneOf(TONE_MAPPINGS, held.toneMapping, DEFAULT_WORLD.toneMapping),
    exposure: readBounded(held, 'exposure', DEFAULT_WORLD.exposure, EXPOSURE),
    ground: readGround(held.ground),
    play: readPlay(held.play),
    // Effects the build has no code for are dropped rather than kept as dead entries — see
    // `readStack`. A composition written by a newer studio opens with what this one can draw.
    post: readStack(held.post, newId),
    layers: readWorldLayers(held.layers),
  }
}

function readBounded(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
  bounds: NumericBounds,
): number {
  return bound(readNumber(source, key, fallback), bounds)
}

function readBackground(value: unknown): BackgroundDescriptor {
  if (!isRecord(value)) return DEFAULT_WORLD.background
  if (value.kind === 'transparent') return { kind: 'transparent' }
  // Every document written before the softening exists says nothing about it, and nothing is
  // exactly what it was: sharp.
  if (value.kind !== 'color')
    return { kind: 'environment', blur: readBounded(value, 'blur', 0, BACKGROUND_BLUR) }

  // A colour background with no colour in it is not a colour background: it would paint black
  // over whatever the document meant, which is the one outcome nobody asked for.
  const color = readString(value, 'color', '')
  return color === '' ? DEFAULT_WORLD.background : { kind: 'color', color }
}

function readFog(value: unknown): FogDescriptor {
  if (!isRecord(value)) return NO_FOG

  if (value.kind === 'linear') {
    return {
      kind: 'linear',
      color: readString(value, 'color', DEFAULT_LINEAR_FOG.color),
      near: readNumber(value, 'near', 10),
      far: readNumber(value, 'far', 60),
    }
  }
  if (value.kind === 'exp2') {
    return {
      kind: 'exp2',
      color: readString(value, 'color', DEFAULT_EXP2_FOG.color),
      density: readBounded(value, 'density', 0.02, FOG_DENSITY),
    }
  }
  return NO_FOG
}

/**
 * The play settings a file holds. Read like everything else here although nothing flies a scene
 * yet: a document written by a template says how it means to be walked, and a reader that
 * dropped it would lose that at the first save.
 */
function readPlay(value: unknown): ScenePlay {
  if (!isRecord(value)) return DEFAULT_PLAY

  return {
    camera: oneOf(PLAY_CAMERAS, value.camera, DEFAULT_PLAY.camera),
    eyeHeight: readBounded(value, 'eyeHeight', DEFAULT_PLAY.eyeHeight, EYE_HEIGHT),
    moveSpeed: readBounded(value, 'moveSpeed', DEFAULT_PLAY.moveSpeed, MOVE_SPEED),
    gravity: readBounded(value, 'gravity', DEFAULT_PLAY.gravity, GRAVITY),
  }
}

/** Missing `layers` is none. A relief without an asset, or an unknown kind, is dropped. */
function readWorldLayers(value: unknown): readonly WorldLayer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(readWorldLayer)
}

function readWorldLayer(value: unknown): readonly WorldLayer[] {
  if (!isRecord(value)) return []
  if (value.kind === 'scatter') return readScatterLayer(value)
  if (value.kind !== 'relief' || !isRecord(value.heightmap)) return []
  const assetId = value.heightmap.assetId
  if (typeof assetId !== 'string' || assetId === '') return []
  return [readReliefLayer(value, assetId)]
}

function readReliefLayer(value: Record<string, unknown>, assetId: string): ReliefLayer {
  const legacySculpt = isRecord(value.sculpt) ? value.sculpt : undefined
  return reliefLayer(
    { assetId },
    {
      id: readString(value, 'id', '') || newId(),
      name: readString(value, 'name', '') || DEFAULT_RELIEF_NAME,
      enabled: readBoolean(value, 'enabled', true),
      locked: readTerrainLocks(value.locked),
      origin: readReliefOrigin(value.origin),
      size: readReliefSize(value.size),
      elevation: readReliefElevation(value.elevation),
      grain: readReliefGrain('grain' in value ? value.grain : legacySculpt?.grain),
      edits: Array.isArray(value.edits)
        ? value.edits.flatMap(readTerrainEditLayer)
        : [migratedSculptEdit(legacySculpt)],
      groundMaterials: Array.isArray(value.groundMaterials)
        ? value.groundMaterials.flatMap(readGroundMaterial)
        : [],
      groundWeights: readTextureRef(value.groundWeights),
    },
  )
}

function readGroundMaterial(value: unknown): readonly GroundMaterialLayer[] {
  if (!isRecord(value)) return []
  const source = isRecord(value.albedo) ? value.albedo : value.texture
  if (!isRecord(source)) return []
  const assetId = source.assetId
  if (typeof assetId !== 'string' || assetId === '') return []
  const normal = readTextureRef(value.normal)
  return [
    {
      albedo: { assetId },
      normal,
      channel: oneOf(GROUND_MATERIAL_CHANNELS, value.channel, 'r'),
    },
  ]
}

function readTextureRef(value: unknown): TextureRef | null {
  if (!isRecord(value) || typeof value.assetId !== 'string' || value.assetId === '') return null
  return { assetId: value.assetId }
}

function readScatterLayer(value: Record<string, unknown>): readonly ScatterLayer[] {
  return [
    scatterLayer({
      id: readString(value, 'id', '') || newId(),
      name: readString(value, 'name', '') || DEFAULT_SCATTER_NAME,
      enabled: readBoolean(value, 'enabled', true),
      locked: readBoolean(value, 'locked', false),
      assets: Array.isArray(value.assets) ? value.assets.flatMap(readScatterAsset) : [],
      seed: readNumber(value, 'seed', 1),
      rules: readScatterRules(value.rules),
      category: oneOf(SCATTER_CATEGORIES, value.category, 'props'),
      collision: readBoolean(value, 'collision', false),
      followRelief: oneOf(SCATTER_FOLLOW_RELIEF, value.followRelief, 'brush'),
      origin: readReliefOrigin(value.origin),
      size: readReliefSize(value.size),
      grain: readReliefGrain(value.grain),
      mask: readReliefMask(value.mask),
    }),
  ]
}

function readScatterAsset(value: unknown): readonly ScatterAsset[] {
  if (!isRecord(value)) return []
  const assetId = readString(value, 'assetId', '')
  if (assetId === '') return []
  const weight = readPositive(value, 'weight', 1)
  return [{ assetId, weight: weight > 0 ? weight : 1 }]
}

function readScatterRules(value: unknown): ScatterRules {
  if (!isRecord(value)) return DEFAULT_SCATTER_RULES
  const rules: ScatterRules = {
    density: readBounded(value, 'density', DEFAULT_SCATTER_RULES.density, SCATTER_DENSITY),
    spacing: readBounded(value, 'spacing', DEFAULT_SCATTER_RULES.spacing, SCATTER_SPACING),
    minScale: readBounded(value, 'minScale', DEFAULT_SCATTER_RULES.minScale, SCATTER_SCALE),
    maxScale: readBounded(value, 'maxScale', DEFAULT_SCATTER_RULES.maxScale, SCATTER_SCALE),
    randomRotation: readBoolean(value, 'randomRotation', DEFAULT_SCATTER_RULES.randomRotation),
    randomTilt: readBounded(value, 'randomTilt', DEFAULT_SCATTER_RULES.randomTilt, SCATTER_TILT),
    slopeAlign: readBounded(
      value,
      'slopeAlign',
      DEFAULT_SCATTER_RULES.slopeAlign,
      SCATTER_SLOPE_ALIGN,
    ),
    altitudeMin: readBounded(
      value,
      'altitudeMin',
      DEFAULT_SCATTER_RULES.altitudeMin,
      SCATTER_ALTITUDE,
    ),
    altitudeMax: readBounded(
      value,
      'altitudeMax',
      DEFAULT_SCATTER_RULES.altitudeMax,
      SCATTER_ALTITUDE,
    ),
    slopeMin: readBounded(value, 'slopeMin', DEFAULT_SCATTER_RULES.slopeMin, SCATTER_SLOPE),
    slopeMax: readBounded(value, 'slopeMax', DEFAULT_SCATTER_RULES.slopeMax, SCATTER_SLOPE),
  }
  const waterDistance = readOptionalNumber(value, 'waterDistance')
  const roadDistance = readOptionalNumber(value, 'roadDistance')
  if (waterDistance !== undefined) rules.waterDistance = waterDistance
  if (roadDistance !== undefined) rules.roadDistance = roadDistance
  return rules
}

/**
 * A document written before `edits` existed: one implicit overlay holding the old `sculpt`
 * chunks, named "Sculpt" so the first stroke still has a layer to land on.
 */
function migratedSculptEdit(legacy: Record<string, unknown> | undefined): TerrainEditLayer {
  const sculpt = legacy ? readReliefSculpt(legacy) : undefined
  return terrainEditLayer({
    id: newId(),
    name: DEFAULT_EDIT_NAME,
    sculpt,
  })
}

function readTerrainEditLayer(value: unknown): readonly TerrainEditLayer[] {
  if (!isRecord(value)) return []
  const sculpt = readReliefSculpt(value.sculpt)
  return [
    terrainEditLayer({
      id: readString(value, 'id', '') || newId(),
      name: readString(value, 'name', '') || DEFAULT_EDIT_NAME,
      enabled: readBoolean(value, 'enabled', true),
      locked: readBoolean(value, 'locked', false),
      alpha: readNumber(value, 'alpha', 1),
      sculpt,
      mask: readReliefMask(value.mask),
    }),
  ]
}

function readTerrainLocks(value: unknown): TerrainLocks {
  if (!isRecord(value)) return UNLOCKED_TERRAIN
  return {
    sculpt: readBoolean(value, 'sculpt', false),
    placement: readBoolean(value, 'placement', false),
  }
}

function readReliefOrigin(value: unknown): ReliefLayer['origin'] {
  if (!isRecord(value)) return DEFAULT_RELIEF_ORIGIN
  return {
    x: readNumber(value, 'x', DEFAULT_RELIEF_ORIGIN.x),
    z: readNumber(value, 'z', DEFAULT_RELIEF_ORIGIN.z),
  }
}

function readReliefSize(value: unknown): ReliefLayer['size'] {
  if (!isRecord(value)) return DEFAULT_RELIEF_SIZE
  return {
    x: readPositive(value, 'x', DEFAULT_RELIEF_SIZE.x),
    z: readPositive(value, 'z', DEFAULT_RELIEF_SIZE.z),
  }
}

function readReliefElevation(value: unknown): ReliefLayer['elevation'] {
  if (!isRecord(value)) return DEFAULT_RELIEF_ELEVATION
  return {
    min: readNumber(value, 'min', DEFAULT_RELIEF_ELEVATION.min),
    max: readNumber(value, 'max', DEFAULT_RELIEF_ELEVATION.max),
  }
}

function readGround(value: unknown): GroundDescriptor {
  if (!isRecord(value)) return DEFAULT_GROUND

  const color = value.color
  return {
    visible: readBoolean(value, 'visible', DEFAULT_GROUND.visible),
    color: typeof color === 'string' && color !== '' ? color : null,
    size: readBounded(value, 'size', DEFAULT_GROUND.size, GROUND_SIZE),
    opacity: readBounded(value, 'opacity', DEFAULT_GROUND.opacity, { min: 0, max: 1 }),
    receiveShadow: readBoolean(value, 'receiveShadow', DEFAULT_GROUND.receiveShadow),
  }
}

/**
 * A fog switched to another form, keeping the colour the previous one wore.
 *
 * The colour and nothing else: a `near`/`far` pair says nothing about a density, and carrying
 * numbers across would give one form the settings of the other.
 */
export function fogOfKind(kind: FogDescriptor['kind'], previous: FogDescriptor): FogDescriptor {
  if (kind === 'none') return NO_FOG
  const color = previous.kind === 'none' ? DEFAULT_LINEAR_FOG.color : previous.color

  return kind === 'linear' ? { ...DEFAULT_LINEAR_FOG, color } : { ...DEFAULT_EXP2_FOG, color }
}

/** What the project offers to light a scene with: its equirectangular pictures, and its skies. */
export type EnvironmentOffer = {
  pictures: readonly { id: string }[]
  skies: readonly { id: string }[]
}

/**
 * What lights a scene, switched to another source. Both of the other two are REFERENCES, so each
 * is only an answer while the project holds one: with none, this stays on the studio rather than
 * writing a reference to nothing.
 *
 * Nothing is carried across, unlike the two below — the studio has no id to remember a sky by,
 * so coming back lands on the project's first one again.
 */
export function environmentOfKind(
  kind: EnvironmentRef['kind'],
  offered: EnvironmentOffer,
): EnvironmentRef {
  if (kind === 'skybox') {
    const first = offered.pictures[0]
    return first ? { kind: 'skybox', assetId: first.id } : STUDIO_ENVIRONMENT
  }

  if (kind === 'sky') {
    const first = offered.skies[0]
    return first ? { kind: 'sky', documentId: first.id } : STUDIO_ENVIRONMENT
  }

  return STUDIO_ENVIRONMENT
}

/** What a colour backdrop opens on when none was ever chosen — a mid grey, flattering nothing. */
const FIRST_BACKDROP = '#4a4a4a'

/**
 * A backdrop switched to another form, keeping the colour the previous one wore — the same rule
 * as `fogOfKind`, and here rather than in the panel for the same reason: it is a decision about
 * the document, and a decision written in JSX is a decision no test reaches.
 */
export function backgroundOfKind(
  kind: BackgroundDescriptor['kind'],
  previous: BackgroundDescriptor,
): BackgroundDescriptor {
  if (kind === 'environment') return DEFAULT_BACKGROUND
  if (kind === 'transparent') return { kind: 'transparent' }

  return { kind: 'color', color: previous.kind === 'color' ? previous.color : FIRST_BACKDROP }
}

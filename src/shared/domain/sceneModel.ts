import type { BodyPart } from './humanoid'
import type { ReliefMask, ReliefSculpt } from './relief'
import type { ScatterLayer } from './scatter'
import type { Us } from './time'
import type { CameraPost } from './postProcessing'
import type { ModelDressRef } from './modelDress'
import type { TextureRef } from './textureRef'
export type OptimizationMode = 'auto' | 'individual' | 'instance' | 'batch' | 'exclude'

export const OPTIMIZATION_MODES: readonly OptimizationMode[] = [
  'auto',
  'individual',
  'instance',
  'batch',
  'exclude',
]

export type OptimizationSettings = { mode: OptimizationMode; groupId?: string }

/** Re-exported so the fifty-odd files that read a pose from here keep reading it from here. */
export { isTransform, isVector3, type Transform, type Vector3 } from './transform'

/** Re-exported for the same reason as the transform above: this is where a scene is read from. */
export type { GeometryDescriptor } from './geometry'

/**
 * A texture is a reference to an asset of the project, never an image and never a three.js
 * object: an engine is rebuilt from its serialized state, so what a document stores has to be
 * something a reload can resolve again. The engine loads it, caches it and frees it.
 */
export type { TextureRef } from './textureRef'
export {
  isWorn,
  MATERIAL_SLOTS,
  modelDressRefOf,
  NOTHING_WORN,
  withMaterialAt,
  wornMaterials,
  type ModelDress,
  type ModelDressRef,
  type ModelMaterial,
} from './modelDress'
/**
 * What a terrain padlock holds. Two aspects rather than one boolean: freezing the sculpt while
 * the patch can still move (or the reverse) is the ordinary case, matching the canvas.
 */
export type TerrainLocks = { sculpt: boolean; placement: boolean }

export const UNLOCKED_TERRAIN: TerrainLocks = Object.freeze({ sculpt: false, placement: false })

/**
 * One named overlay on a terrain. Locked is a single boolean: an edit has no placement of its
 * own, and splitting sculpt from alpha would invent a workflow Unreal does not offer.
 */
export type TerrainEditLayer = {
  id: string
  name: string
  enabled: boolean
  locked: boolean
  /** Signed blend weight. 1 = deltas as stored; 0 = none; negative subtracts. */
  alpha: number
  sculpt?: ReliefSculpt
  mask?: ReliefMask
}

/**
 * A patch of the world's surface. Relief names a heightmap by `TextureRef`, never the pixels.
 * Bytes are OpenEXR float32 — not PNG-16, not a house binary. Texel size lives on the asset.
 * Several `kind: 'relief'` entries are distinct spatial zones, never blended with each other.
 */
export type ReliefLayer = {
  kind: 'relief'
  id: string
  name: string
  enabled: boolean
  locked: TerrainLocks
  heightmap: TextureRef
  /** World position of the min corner (smallest x and z). */
  origin: { x: number; z: number }
  /** Width (x) and depth (z) in scene units. A rectangle, unlike the ground's square `size`. */
  size: { x: number; z: number }
  /**
   * World Y that sample 0 and sample 1 map to. The EXR is raw float32, not a 0–1 map;
   * `{ min: 0, max: 1 }` is the identity the decoder already produced.
   */
  elevation: { min: number; max: number }
  grain: number
  edits: readonly TerrainEditLayer[]
  /** Up to four appearances, each addressed by one channel of `groundWeights`. */
  groundMaterials: readonly GroundMaterialLayer[]
  /** Shared RGBA splat weights. Null preserves the single-material legacy rendering path. */
  groundWeights: TextureRef | null
}

export type GroundMaterialChannel = 'r' | 'g' | 'b' | 'a'

export const GROUND_MATERIAL_CHANNELS: readonly GroundMaterialChannel[] = ['r', 'g', 'b', 'a']

export function groundMaterialChannelOffset(channel: GroundMaterialChannel): number {
  return GROUND_MATERIAL_CHANNELS.indexOf(channel)
}

/** One appearance layer addressed by a channel of the terrain's shared weight texture. */
export type GroundMaterialLayer = {
  albedo: TextureRef
  normal: TextureRef | null
  channel: GroundMaterialChannel
}

/** Open union: a later kind does not migrate documents written with only Relief. */
export type { ScatterLayer }
export type WorldLayer = ReliefLayer | ScatterLayer

/**
 * A camera the scene holds, as opposed to the one the viewport looks through. It is a node like
 * any other — pickable, movable, animatable by a track — and glTF carries one, so it survives an
 * export where a viewport setting never could.
 */
export type CameraDescriptor = {
  /** Vertical field of view, in degrees, as every other angle a person types. */
  fov: number
  near: number
  far: number
  /**
   * What this camera does with the scene's composition. Absent on every camera ever written,
   * and absent means `inherit` — see `postOf`, the one place that says so.
   */
  post?: CameraPost
}

export const DEFAULT_CAMERA: CameraDescriptor = Object.freeze({ fov: 50, near: 0.1, far: 1000 })

/** Re-exported for the same reason as the transform above: a scene is read from here. */
export {
  bezierPathOf,
  DEFAULT_PATH,
  handleAt,
  handlesMatch,
  type PathDescriptor,
  type SmoothPath,
} from './path'

/**
 * An imported model, for the same reason and in the same shape as a texture: what a document
 * stores is what a reload can resolve again.
 *
 * One node holding a reference, never a subtree of nodes. A single GLB brings meshes by the
 * thousand, and a save was measured freezing every window past ~5500 nodes — the document grows
 * by one row here whatever the file weighs. The cost is that the inside of a model cannot be edited;
 * that is the right trade for a generation studio, and an explicit "explode" command is what
 * would lift it the day it matters.
 */
export type ModelRef = {
  assetId: string
  /** What plays on this model: one lane per layer, and the blocks inside each. */
  lanes?: readonly ClipLane[]
  /**
   * @deprecated Read when a document written before lanes existed is opened, and folded into a
   * single lane. Never written again.
   */
  clips?: readonly ClipRef[]
  /**
   * @deprecated Read when a document written before clips were plural is opened, and converted
   * into a single `ClipRef`. Never written again.
   */
  animation?: AnimationRef
  /** What covers this model. Absent leaves it wearing what its own file carries. */
  dress?: ModelDressRef
  /**
   * @deprecated Read when a document written before `dress` existed is opened, and folded into a
   * one-entry `materials`. Never written again.
   */
  materialDocumentId?: string
}

/**
 * Which clip of a model plays, and how. Absent on a model carrying none, and on every document
 * written before animation existed — the reader fills it in rather than refusing the node.
 *
 * The head position is part of it on purpose: an engine is rebuilt from its state, and a scene
 * reopened on frame one would lose the pose its author saved it on.
 */
export type AnimationRef = {
  /** The clip's name as the file spells it. A name the file no longer holds simply plays nothing. */
  clip: string
  playing: boolean
  /**
   * Where the head stands inside the clip, in SECONDS — three's mixer counts in them and this
   * rides straight into it. The scene's own timeline counts in microseconds (`Keyframe.time`):
   * the two meet only through `secondsToUs`, never by being handed to one another.
   */
  time: number
  /** A multiplier, never a frame rate: the clip carries its own timing. */
  speed: number
  loop: boolean
  /**
   * Where the block sits on the scene's band, in MICROSECONDS — the unit that band counts in,
   * unlike `time` just above, which is three's own clock inside the clip.
   *
   * It is what makes a clip a block one can move rather than something that simply runs: before
   * the head reaches it the model stands at its rest pose, and the render walks it frame by
   * frame instead of leaving it wherever real time happened to leave it.
   */
  start: Us
}

/**
 * Where a clip's frames come from.
 *
 * `embedded` is the file the model itself is: the name is the one the GLB spells. `bundled` is a
 * folder shipped beside the app, named by that FOLDER — never by what its clip spells, which is
 * `NlaTrack` on a Tripo rig and nothing at all on Uthana's. `asset` is a clip of the project's
 * own library, reusable by any character.
 */
export type ClipSource =
  | { kind: 'embedded'; name: string }
  | { kind: 'bundled'; name: string; clipIndex?: number }
  | { kind: 'asset'; assetId: string; name: string; clipIndex?: number }

export function isClipIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export const CLIP_SOURCES: readonly ClipSource['kind'][] = ['embedded', 'bundled', 'asset']

/**
 * What a block may be sped up or slowed to. Zero would make it infinitely long, and past four
 * times a motion reads as a glitch rather than as a faster move.
 *
 * Here rather than in the engine that reads it, for the reason `TILES_PER_METRE` is: it bounds
 * what a DOCUMENT may hold, so the registry on this side of the boundary can state it too.
 */
export const CLIP_SPEED = Object.freeze({ min: 0.1, max: 4 })

/** Seconds. Past a second a transition stops reading as one move joining another. */
export const MAX_CLIP_FADE = 1

/**
 * What a block's clip is filed under, wherever a player or a length is kept by name.
 *
 * The kind is part of it, and that is the whole point: an animation shipped as `walk` and a clip
 * the model's own file spells `walk` are two different things, and a bare name would play one
 * for the other.
 */
export function clipKeyOf(source: ClipSource): string {
  if (source.kind === 'embedded') return source.name
  // The id and not the name: two library clips may well be called the same thing.
  const key = source.kind === 'asset' ? `asset:${source.assetId}` : `bundled:${source.name}`
  return source.clipIndex ? `${key}:clip:${source.clipIndex}` : key
}

/**
 * One block of animation on a model's band.
 *
 * MIND THE UNITS, and they are not the same in both halves of this type: `start`, `duration`,
 * `fadeIn` and `fadeOut` are MICROSECONDS, the unit the band counts in; `offset` is SECONDS,
 * three's own clock inside the clip. The two meet only through `secondsToUs` / `usToSeconds`,
 * never by being handed to one another.
 */
export type ClipRef = {
  /** Minted by the studio, so two blocks of the same clip are still two blocks. */
  id: string
  source: ClipSource
  /**
   * The words shown for this block. The studio OWNS them and never takes them from the file:
   * a Tripo rig spells its only clip `NlaTrack`, and Uthana's carries no name at all.
   */
  label: string
  /** Where the block sits on the band. */
  start: Us
  /** How much band it takes. `0` means "not measured yet" — the length lives in the file. */
  duration: Us
  /** Where playback starts INSIDE the clip, in three's seconds. */
  offset: number
  /** A multiplier, never a frame rate: the clip carries its own timing. */
  speed: number
  loop: boolean
  fadeIn: Us
  fadeOut: Us
  /** `auto` lets the studio decide from what the clip actually holds. */
  rootMotion: RootMotion
  /**
   * Which bones this block drives. Absent is the whole body — what every document written before
   * this field says, and what a lone block wants anyway.
   *
   * It is what makes « walking AND raising the arms » something other than the average of the
   * two: blocks driving different halves stop sharing the pose out between them.
   */
  part?: BodyPart
}

/**
 * One layer of blocks on a model's track, and several of them stack.
 *
 * A lane is what makes two moves play AT ONCE — a walk under a wave — where blocks laid in one
 * lane simply take turns. It exists even while empty: an object has its lane before it has
 * anything to put in it.
 */
export type ClipLane = {
  id: string
  clips: readonly ClipRef[]
}

/**
 * The lane a document written before lanes existed describes, and the one a model is given when
 * it first needs somewhere to drop a block. Fixed rather than minted, so reopening a file twice
 * gives the same document.
 */
export const MAIN_LANE_ID = 'main'

export function clipLane(id: string, clips: readonly ClipRef[] = []): ClipLane {
  return { id, clips }
}

export type RootMotion = 'inPlace' | 'travel' | 'auto'

export const ROOT_MOTIONS: readonly RootMotion[] = ['inPlace', 'travel', 'auto']

/** What a block is worth before anything is chosen for it. */
const DEFAULT_CLIP: Omit<ClipRef, 'id' | 'source' | 'label'> = Object.freeze({
  start: 0,
  duration: 0,
  offset: 0,
  speed: 1,
  loop: true,
  fadeIn: 0,
  fadeOut: 0,
  rootMotion: 'auto',
})

/**
 * A block on one of the clips a model's own file brought.
 *
 * `extra` goes UNDER the identity, so carrying a previous block over cannot smuggle in the clip
 * it used to play.
 */
export function embeddedClip(id: string, name: string, extra: Partial<ClipRef> = {}): ClipRef {
  return { ...DEFAULT_CLIP, ...extra, id, source: { kind: 'embedded', name }, label: name }
}

/** A block on an animation shipped with the app, named — and labelled — by its folder. */
export function bundledClip(id: string, name: string, extra: Partial<ClipRef> = {}): ClipRef {
  return { ...DEFAULT_CLIP, ...extra, id, source: { kind: 'bundled', name }, label: name }
}

/**
 * A block on an animation the PROJECT holds: a file of its own, played on another character.
 *
 * The name is the asset's, which is a file's stem rather than anything the clip inside spells —
 * `NlaTrack` and `animation_0` are what those spell, and neither may reach the screen.
 */
export function assetClip(
  id: string,
  assetId: string,
  name: string,
  extra: Partial<ClipRef> = {},
): ClipRef {
  return { ...DEFAULT_CLIP, ...extra, id, source: { kind: 'asset', assetId, name }, label: name }
}

/**
 * The block a document written before clips were plural describes.
 *
 * The id is fixed rather than minted so that reopening a file twice gives the same document; that
 * form holds one clip per model, so a constant is unique where it has to be.
 */
export function clipFromAnimation(animation: AnimationRef): ClipRef {
  return embeddedClip('legacy', animation.clip, {
    // Checked rather than read: `start` came late, and a document older than it holds none —
    // the reader that lets such a node through does not require it either.
    start: Number.isFinite(animation.start) ? animation.start : 0,
    offset: animation.time,
    // `playing` is deliberately dropped: whether a block runs on real time is session state now
    // (see `SelfPlay`), and a document reopening mid-walk would put an undo entry behind a play
    // button.
    speed: animation.speed,
    loop: animation.loop,
  })
}

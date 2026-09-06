import {
  isTransform,
  isVector3,
  modelDressRefOf,
  ROOT_MOTIONS,
  TEXTURE_SLOTS,
} from '@shared/domain/scene'
import { isClipIndex } from '@shared/domain/sceneModel'
import { CSG_OPERATIONS } from '@shared/domain/csg'
import { BODY_PARTS } from '@shared/domain/humanoid'
import { isRecord } from '@shared/guards'
import {
  GEOMETRY_SPECS,
  LIGHT_SPECS,
  MATERIAL_SPECS,
  SPRITE_SPECS,
  TEXT_SPECS,
  type PropertySpec,
} from './propertyFields'
import type { SceneNode } from './sceneState'

type SpecTable = Record<string, Record<string, PropertySpec> | undefined>

/** The colour is checked apart: `null` is legal for it, and for nothing else. */
const MEASURED_MATERIAL = Object.entries(MATERIAL_SPECS).filter(([name]) => name !== 'color')

/** Same, for a sprite: derived from the table so a field added to it cannot go unchecked. */
const MEASURED_SPRITE = Object.entries(SPRITE_SPECS).filter(([name]) => name !== 'color')

export function isSceneNode(value: unknown): value is SceneNode {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (value.parentId !== null && typeof value.parentId !== 'string') return false
  if (typeof value.name !== 'string' || typeof value.visible !== 'boolean') return false
  if (!isTransform(value.transform)) return false
  // Absent is legal and means "the default", filled in below. `null` counts as absent: a tool
  // that serializes missing fields that way must not cost the node.
  if (!isOptionalFlag(value.castShadow) || !isOptionalFlag(value.receiveShadow)) return false
  if (!isOptionalOptimization(value.optimization)) return false

  return isNodeContent(value)
}

function isOptionalOptimization(value: unknown): boolean {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  if (!['auto', 'individual', 'instance', 'batch', 'exclude'].includes(String(value.mode))) {
    return false
  }
  return value.groupId === undefined || typeof value.groupId === 'string'
}

function isNodeContent(value: Record<string, unknown>): boolean {
  if (value.type === 'mesh' || value.type === 'model') return isAssetNode(value)
  return isOtherNode(value)
}

function isAssetNode(value: Record<string, unknown>): boolean {
  if (value.type === 'mesh') {
    return (
      describes(value.geometry, GEOMETRY_SPECS) &&
      isGeometryRun(value.geometry) &&
      isMaterial(value.material) &&
      isOptionalFlag(value.negative) &&
      isOptionalBakedInstances(value.instances)
    )
  }
  // A model is a reference and nothing else: an absent or non-string `assetId` costs the node,
  // never the file. What it points at is resolved when the scene is built, not here — a project
  // whose assets moved still opens, with a hole where the model was.
  if (value.type === 'model')
    return (
      isRecord(value.model) &&
      typeof value.model.assetId === 'string' &&
      isOptionalAnimation(value.model.animation) &&
      isOptionalClips(value.model.clips) &&
      isOptionalLanes(value.model.lanes) &&
      isOptionalTextureOverrides(value.model.textures) &&
      isOptionalDress(value.model.dress) &&
      // A document id, never resolved here: the material may have been deleted, and a scene that
      // still opens with a model wearing its file's own maps is better than one that will not.
      (value.model.materialDocumentId === undefined ||
        typeof value.model.materialDocumentId === 'string')
    )
  return false
}

function isOptionalBakedInstances(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.every(
        instance =>
          isRecord(instance) &&
          typeof instance.sourceId === 'string' &&
          typeof instance.name === 'string' &&
          isTransform(instance.transform),
      ))
  )
}

function isOtherNode(value: Record<string, unknown>): boolean {
  // A sprite is its colour, its opacity and at most one map — the same shapes as a material's,
  // checked against the same table.
  if (value.type === 'sprite') return isSprite(value.sprite)
  // A text is words, a face and three numbers, wearing a material like a mesh does.
  if (value.type === 'text') return isText(value.text) && isMaterial(value.material)
  // A group carries nothing of its own: everything it is has already been checked above.
  if (value.type === 'group') return true
  // The recipe, and the material it wears like a mesh. A graph that does not read is the node
  // refused rather than a solid drawn from half a recipe — glTF being index-bound, half a graph
  // is a broken file, not a partly right one.
  if (value.type === 'carved')
    return isCsgGraph(value.carved) && isMaterial(value.material) && isOptionalFlag(value.negative)
  // Three numbers, and a file that holds none of them keeps its node: the defaults are what a
  // camera is without them, and `revived` lays them under whatever the file did say.
  if (value.type === 'camera') return value.camera === undefined || isRecord(value.camera)
  // A rail is its points, and a curve through fewer than two is a point with a name — refused
  // like a model with no asset, so the rest of the scene still opens.
  if (value.type === 'path') return isPath(value.path)

  return value.type === 'light' && describes(value.light, LIGHT_SPECS)
}

/**
 * A boolean recipe: one base brush, then any number of steps. The shapes go through the very
 * table a mesh's does, so a primitive gained is accepted here the day it is offered on screen.
 */
function isCsgGraph(value: unknown): boolean {
  if (!isRecord(value) || !isCsgPart(value.base)) return false
  if (!Array.isArray(value.steps)) return false

  return value.steps.every(
    step =>
      isRecord(step) && CSG_OPERATIONS.some(one => one === step.operation) && isCsgPart(step.part),
  )
}

function isCsgPart(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false
  if (!isTransform(value.transform)) return false
  // A shape, or a whole recipe: a solid folded into another solid nests here, and the check
  // walks down with it. `base` is what a graph has and a descriptor never does.
  const shape = value.geometry
  const nested = isRecord(shape) && 'base' in shape
  if (!(nested ? isCsgGraph(shape) : describes(shape, GEOMETRY_SPECS))) return false
  // Absent on a document written before a brush kept its own: the solid's material is laid under
  // it in `revived`, which is what a separate then hands back.
  return value.material === undefined || isMaterial(value.material)
}

function isOptionalFlag(value: unknown): boolean {
  return value == null || typeof value === 'boolean'
}

/** No spec describes a rail — it is dragged, never typed — so `describes` walks past it. */
function isGeometryRun(value: unknown): boolean {
  if (!isRecord(value) || value.kind !== 'ribbon') return true
  return isPath(value.path)
}

/** Its points and its shape. `closed` and `tension` absent mean the defaults `revived` lays in. */
function isPath(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.points)) return false
  if (value.points.length < 2 || !value.points.every(isVector3)) return false
  if (!isOptionalFlag(value.closed)) return false
  if (value.tension != null && !Number.isFinite(value.tension)) return false

  // 🛑 One pair of tangents per anchor: a run holding fewer would draw a curve past the end of
  // its own handles, and `handleAt` would hand back a corner where the file said otherwise.
  if (value.kind !== 'bezier') return true
  return (
    Array.isArray(value.handles) &&
    value.handles.length === value.points.length &&
    value.handles.every(one => isRecord(one) && isVector3(one.in) && isVector3(one.out))
  )
}

/**
 * Absent is legal and means "still", as for the two older forms below: a document written before
 * lanes existed holds none, and `revived` is what folds what it does hold into one.
 */
function isOptionalLanes(value: unknown): boolean {
  if (value == null) return true

  return Array.isArray(value) && value.every(isLane)
}

function isLane(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string') return false

  return Array.isArray(value.clips) && value.clips.every(isClip)
}

/**
 * Absent is legal and means "still", exactly as for the singular below: a document written before
 * clips were plural holds none, and `revived` is what turns the one it does hold into a list.
 */
function isOptionalClips(value: unknown): boolean {
  if (value == null) return true

  return Array.isArray(value) && value.every(isClip)
}

function isClip(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.label !== 'string') return false
  if (!isClipSource(value.source)) return false
  // `playing` is NOT required, and a document written while it was still a field must keep
  // passing: it is session state now, so an extra boolean in the file is simply ignored.
  if (typeof value.loop !== 'boolean') return false
  if (!ROOT_MOTIONS.some(motion => motion === value.rootMotion)) return false
  // Absent is legal and means the whole body: every document written before the halves existed.
  if (value.part != null && !BODY_PARTS.some(part => part === value.part)) return false

  return ['start', 'duration', 'offset', 'speed', 'fadeIn', 'fadeOut'].every(field =>
    Number.isFinite(value[field]),
  )
}

function isClipSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.name !== 'string') return false
  if (value.clipIndex !== undefined && !isClipIndex(value.clipIndex)) return false
  if (value.kind === 'embedded' || value.kind === 'bundled') return true

  return value.kind === 'asset' && typeof value.assetId === 'string' && value.assetId !== ''
}

/**
 * Absent is legal and means "still": every document written before animation existed says
 * nothing here. A record that is there but malformed costs the node, like every other field —
 * a file that says nothing is not a file that says wrong.
 */
function isOptionalAnimation(value: unknown): boolean {
  if (value == null) return true
  if (!isRecord(value)) return false

  return (
    typeof value.clip === 'string' &&
    typeof value.playing === 'boolean' &&
    typeof value.loop === 'boolean' &&
    Number.isFinite(value.time) &&
    Number.isFinite(value.speed)
  )
}

/**
 * The maps put over the ones a model's file carries. Absent is legal and means "the file's own",
 * which is what every document written before overriding existed says.
 *
 * A slot spelled with something that is not a reference costs the node, exactly as a malformed
 * animation does: the alternative is a model coming back with one map silently missing.
 */
function isOptionalTextureOverrides(value: unknown): boolean {
  if (value == null) return true
  if (!isRecord(value)) return false

  // `null` is refused where a material's own slots take it: there, `null` means « no map », and
  // here « the file's own » is what an ABSENT slot already says. Accepting it would load a state
  // its own type forbids, and one `setModelTextures` never empties — the dead field would be
  // written back on every save.
  return TEXTURE_SLOTS.every(
    slot => value[slot] === undefined || (value[slot] !== null && isTextureRef(value[slot])),
  )
}

/**
 * What covers a model, or nothing. A dress spelling NEITHER kind costs the node rather than being
 * dropped to nothing: its author meant something this reader cannot name, and silently undressing
 * the model would hide that.
 */
function isOptionalDress(value: unknown): boolean {
  if (value == null) return true
  return modelDressRefOf(value) !== null
}

/**
 * The timeline a file holds, or an empty one. Read track by track rather than refused whole, on
 * the rule the nodes already follow: a project folder is user territory, and one malformed track
 * must not cost the animation around it. Public for the motion files, whose band rides in the
 * `extras` of a `.glb` scene and is the very same question asked of other bytes.
 */
function describes(value: unknown, table: SpecTable): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false

  const fields = table[value.kind]
  if (!fields) return false

  return Object.entries(fields).every(([name, spec]) => matches(value[name], spec))
}

/**
 * A field the table describes, or absent — and absent means the default, which `revived` fills.
 *
 * This is what keeps a field ADDED to a spec table from deleting the node out of every document
 * written before it existed. The tables are exhaustive by typecheck, so a new field is required
 * of files that could not have carried it the moment it lands, and a node that fails its guard
 * is dropped in silence — indistinguishable from a node that never existed.
 *
 * Only `undefined`, never `null`: the colour and the texture slots read `null` as a value of
 * their own, and a number stored as `null` is a file saying something wrong rather than saying
 * nothing.
 */
function measures(value: unknown, spec: PropertySpec): boolean {
  return value === undefined || matches(value, spec)
}

/**
 * 🛑 Read off the CONTROL, never assumed numeric: falling through to `Number.isFinite` cost the
 * WHOLE node for any field that is not a number. No table read here carries one of the three today.
 */
function matches(value: unknown, spec: PropertySpec): boolean {
  if (spec.control === 'color') return typeof value === 'string'
  if (spec.control === 'vector3') return isVector3(value)
  if (spec.control === 'toggle') return typeof value === 'boolean'
  if (spec.control === 'choice') return spec.options.some(one => one === value)
  if (spec.control === 'asset') return typeof value === 'string'
  // `Number.isFinite`, not `typeof`: JSON has no NaN, but `1e999` parses to Infinity, and a
  // geometry built from one produces vertices the raycaster then never hits.
  return Number.isFinite(value)
}

function isMaterial(value: unknown): boolean {
  if (!isRecord(value) || value.kind !== 'standard') return false
  // `null` means the studio's own colour, resolved when the mesh is built.
  if (value.color !== null && typeof value.color !== 'string') return false
  if (!MEASURED_MATERIAL.every(([name, spec]) => measures(value[name], spec))) return false

  // A slot added to `TEXTURE_SLOTS` is the same trap as a field added to a table, and the
  // default it revives with — no texture — is the one absence already means.
  return TEXTURE_SLOTS.every(slot => value[slot] === undefined || isTextureRef(value[slot]))
}

function isSprite(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.color !== null && typeof value.color !== 'string') return false
  if (!MEASURED_SPRITE.every(([name, spec]) => measures(value[name], spec))) return false

  return value.map === undefined || isTextureRef(value.map)
}

/**
 * The face is read rather than checked: `readFontRef` falls back on one the studio ships, so a
 * document naming a family nothing can answer still opens — with plain letters, and a line in the
 * log — instead of losing the node whole.
 */
function isText(value: unknown): boolean {
  if (!isRecord(value) || typeof value.value !== 'string') return false

  return Object.entries(TEXT_SPECS).every(([name, spec]) => measures(value[name], spec))
}

function isTextureRef(value: unknown): boolean {
  if (value === null) return true
  return isRecord(value) && typeof value.assetId === 'string'
}

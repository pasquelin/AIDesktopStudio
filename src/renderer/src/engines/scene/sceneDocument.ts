/**
 * A scene as a saved document writes and reads it.
 *
 * Which fields a descriptor must carry is read off the very tables the inspector derives its
 * controls from, rather than restated as a schema here: a primitive gained or a parameter
 * renamed cannot leave a loader still accepting the shape before it.
 *
 * ACCEPTING a value is separate from KEEPING it. Only presence and type decide whether a node is
 * read at all — never the `min`/`max` those tables also declare, since a document written by an
 * earlier build is allowed to hold a value today's bounds would refuse, and dropping the node
 * would lose it in silence. What `revived` does afterwards is the other question: one field is
 * clamped there, and it says why.
 */
import {
  clipFromAnimation,
  clipLane,
  DEFAULT_CAMERA,
  DEFAULT_PATH,
  MAIN_LANE_ID,
  TILES_PER_METRE,
  type MaterialDescriptor,
  type ModelRef,
  type SceneWorld,
} from '@shared/domain/scene'
import type { CsgPart } from '@shared/domain/csg'
import { readWorld } from './sceneWorld'
import { SCENE_SUBJECT_ID, type AnimationTimeline } from '@shared/domain/animation'
import { readFontRef } from '@shared/domain/font'
import { readCameraPost } from '@shared/domain/postProcessing'
import { isRecord } from '@shared/guards'
import type { Component } from '@shared/domain/component'
import { isComponentType } from '@shared/domain/componentRegistry'
import { newId } from '@/helpers/ids'
import { clamp } from '@shared/numeric'
import {
  DEFAULT_MATERIAL,
  DEFAULT_SPRITE,
  DEFAULT_TEXT,
  EMPTY_SCENE,
  shadowDefaults,
  type SceneNode,
  type SceneState,
} from './sceneState'
import { isSceneNode } from './sceneNodeValidation'
import { readTimeline } from './sceneTimeline'

export { readTimeline, timelineRowsLost } from './sceneTimeline'

/** What a saved scene holds. The selection is session state, and is deliberately left out. */
export type ScenePayload = {
  nodes: readonly SceneNode[]
  world: SceneWorld
  animation: AnimationTimeline
}

export function scenePayload(state: SceneState): ScenePayload {
  // The scene's own composition line stands beside the nodes, never among them: without it here
  // a save would quietly drop `@scene` from the sheet, and the composition would lose its line.
  const alive = new Set([...state.nodes.map(node => node.id), SCENE_SUBJECT_ID])
  const sheet = state.animation.sheet.filter(id => alive.has(id))

  return {
    nodes: state.nodes,
    world: state.world,
    // The sheet WITHOUT the objects the scene has lost. Deleting one leaves its id behind on
    // purpose — an undo then gives the object its line back — but writing it would let a file
    // gather ghosts nobody ever clears, one per object ever deleted.
    animation:
      sheet.length === state.animation.sheet.length
        ? state.animation
        : { ...state.animation, sheet },
  }
}

/**
 * The scene a document's payload describes, keeping the nodes it fully describes and dropping
 * the rest.
 *
 * A project folder is user territory: a file can be hand-edited, truncated, or synced back half
 * written. Dropping what no longer parses shows the rest of the scene; refusing the file whole
 * would show nothing, and a scene of ninety-nine good meshes is not lost to one bad one.
 */
export function sceneFromPayload(payload: unknown): SceneState {
  if (!isRecord(payload) || !Array.isArray(payload.nodes)) return EMPTY_SCENE

  const nodes: readonly unknown[] = payload.nodes
  /**
   * Defaults first, the node on top: a flag the file does not hold keeps its default, one it
   * holds wins. That ordering *is* the migration — every document written so far predates
   * shadows, and requiring the flags would have emptied each of them at load, silently, since a
   * dropped node looks exactly like one that was never there.
   */
  const kept = withoutAmbiguousBakedSources(nodes.filter(isSceneNode).map(revived))

  return {
    nodes: kept,
    selectedIds: [],
    // The root `environment` is where the sky lived before the world existed — see `readWorld`.
    world: readWorld(payload.world, payload.environment),
    animation: readTimeline(payload.animation, kept),
  }
}

function withoutAmbiguousBakedSources(nodes: readonly SceneNode[]): SceneNode[] {
  const nodeIds = new Set(nodes.map(node => node.id))
  const sourceIds = new Set<string>()
  return nodes.filter(node => {
    if (node.type !== 'mesh' || !node.instances) return true
    const local = new Set<string>()
    const ambiguous = node.instances.some(instance => {
      const id = instance.sourceId
      if (id === '' || nodeIds.has(id) || sourceIds.has(id) || local.has(id)) return true
      local.add(id)
      return false
    })
    if (ambiguous) return false
    for (const id of local) sourceIds.add(id)
    return true
  })
}

/**
 * A node as the studio holds it, from a node as the file spells it.
 *
 * The typeface is read rather than trusted: a family the studio no longer ships falls back to one
 * it does. A family the machine simply has not got is kept — the document said what it meant, and
 * the engine is what reports that this machine cannot honour it.
 */
function revived(node: SceneNode): SceneNode {
  const filled = { ...withComponentsRead(node), ...withDefaults(node) }
  if (filled.type === 'mesh' || filled.type === 'carved') return revivedSolid(filled)
  if (filled.type === 'model') return revivedModel(filled)
  if (filled.type === 'sprite')
    return { ...filled, sprite: { ...DEFAULT_SPRITE, ...filled.sprite } }
  if (filled.type === 'camera') return revivedCamera(filled)
  if (filled.type === 'path') return { ...filled, path: { ...DEFAULT_PATH, ...filled.path } }
  if (filled.type !== 'text') return filled

  return {
    ...filled,
    material: revivedMaterial(filled.material),
    text: { ...DEFAULT_TEXT, ...filled.text, font: readFontRef(filled.text.font) },
  }
}

function revivedModel(node: Extract<SceneNode, { type: 'model' }>): SceneNode {
  // 🛑 The skeleton left the document for the model's own file.
  const filled = node
  if (filled.type === 'model' && 'rig' in filled.model) {
    const model = { ...filled.model }
    delete (model as { rig?: unknown }).rig
    return { ...filled, model }
  }
  return { ...filled, model: withDress(withLanes(filled.model)) }
}

function revivedSolid(node: Extract<SceneNode, { type: 'mesh' | 'carved' }>): SceneNode {
  if (node.type === 'mesh') return { ...node, material: revivedMaterial(node.material) }

  const material = revivedMaterial(node.material)
  // A brush written before it kept its own material takes the solid's, so `separateNode`
  // always hands back something painted rather than a hole in the descriptor.
  const painted = (part: CsgPart): CsgPart => ({
    ...part,
    material: revivedMaterial(part.material ?? material),
  })

  return {
    ...node,
    material,
    carved: {
      ...node.carved,
      base: painted(node.carved.base),
      steps: node.carved.steps.map(step => ({ ...step, part: painted(step.part) })),
    },
  }
}

function revivedCamera(node: Extract<SceneNode, { type: 'camera' }>): SceneNode {
  const { post, ...lens } = { ...DEFAULT_CAMERA, ...node.camera }
  const read = readCameraPost(post, newId)
  // `inherit` is what an absent field means, so it is not written back.
  return { ...node, camera: read.mode === 'inherit' ? lens : { ...lens, post: read } }
}

/**
 * The components the studio can act on, and only those.
 *
 * A type this build does not know is dropped from the STATE — nothing would simulate it and no
 * form could show it — and `sceneHoldsMore` then refuses to save the file over it, exactly as it
 * refuses a glTF extension we do not write. Dropping and saving would lose an author's work in
 * silence; refusing says so.
 *
 * An untouched node comes back untouched: a document written before components existed keeps no
 * key, so it saves back byte for byte.
 */
function withComponentsRead(node: SceneNode): SceneNode {
  if (node.components === undefined) return node

  const raw: unknown = node.components
  return { ...node, components: Array.isArray(raw) ? raw.filter(isKnownComponent) : [] }
}

const isKnownComponent = (value: unknown): value is Component =>
  isRecord(value) && isComponentType(value.type)

/**
 * A material over its defaults, with its tiling held inside the bounds the field offers.
 *
 * CLAMPED rather than refused: `isMaterial` accepts any finite number, and tightening it there
 * would drop the whole node in silence — a mesh gone is worse than a mesh tiled oddly. Zero is
 * the case that matters, and it collapses every UV onto one texel.
 */
function revivedMaterial(material: MaterialDescriptor): MaterialDescriptor {
  const filled = { ...DEFAULT_MATERIAL, ...material }

  return {
    ...filled,
    tilesPerMetre: clamp(filled.tilesPerMetre, TILES_PER_METRE.min, TILES_PER_METRE.max),
  }
}

/**
 * A model's lanes, from whichever of the three forms the file spells. The two older ones are READ
 * and never written again — dropping either would lose the animation of every scene saved so far,
 * and a node that plays nothing looks exactly like one that never played.
 */
function withLanes(model: ModelRef): ModelRef {
  if (model.lanes) return model

  const clips = model.clips ?? (model.animation ? [clipFromAnimation(model.animation)] : null)
  if (!clips) return model

  const next = { ...model, lanes: [clipLane(MAIN_LANE_ID, clips)] }
  delete next.clips
  delete next.animation
  return next
}

/**
 * A model's dress, folding the single material id every document written before the two modes
 * existed spells. Read and never written again — dropping it would undress every model already
 * saved, and a model back in its file's own material looks exactly like one never dressed.
 */
function withDress(model: ModelRef): ModelRef {
  if (model.dress || !model.materialDocumentId) return model

  const next: ModelRef = {
    ...model,
    dress: { kind: 'materials', documentIds: [model.materialDocumentId] },
  }
  delete next.materialDocumentId
  return next
}

/** The flags, filled in where the file holds none — `null` included. */
function withDefaults(node: SceneNode): Pick<SceneNode, 'castShadow' | 'receiveShadow'> {
  const defaults = shadowDefaults(node)
  return {
    castShadow: node.castShadow ?? defaults.castShadow,
    receiveShadow: node.receiveShadow ?? defaults.receiveShadow,
  }
}

/** Keyed by kind rather than by shape, which is what makes an unknown kind a refusal. */

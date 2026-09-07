import {
  clipLane,
  MAIN_LANE_ID,
  withMaterialAt,
  wornMaterials,
  type CameraDescriptor,
  type ClipLane,
  type ClipRef,
  type MaterialDescriptor,
  type ModelDressRef,
  type ModelRef,
  type PathDescriptor,
  type SpriteDescriptor,
  type TextDescriptor,
} from '@shared/domain/scene'
import { type Command } from '../core/history'
import { batch } from './nodeBatchCommands'
import { editPart, sweep, type NodeEdit } from './nodeEditCommands'
import { withField, type FieldValue } from './propertyFields'
import { type SceneNode, type SceneState } from './sceneState'

/**
 * Scene edits, reimplemented in TypeScript from `mrdoob/three.js/editor/js/commands/` (MIT).
 * The structure is what was worth taking; the original is untyped JavaScript built on its own
 * `signals` bus.
 *
 * A command captures what it needs to revert **as it is applied**, not as it is built: what an
 * object looked like before is only known once the edit actually runs. Redo re-applies and
 * re-captures, so a command survives being replayed.
 */
export function setPath(id: string, path: PathDescriptor): NodeEdit {
  return editPart('path', id, 'path', { path })
}

/** What a camera sees through: its lens, edited like any other descriptor. */
export function setCamera(id: string, camera: CameraDescriptor): NodeEdit {
  return editPart('camera', id, 'camera', { camera })
}

/**
 * A lens parameter typed into the inspector, written onto every selected camera.
 *
 * No anchor to spread from, unlike a light's: a lens has no vector field, so the value typed is
 * the value every camera of the selection takes.
 */
export function setCameraOn(
  nodes: readonly SceneNode[],
  name: string,
  value: FieldValue,
): Command<SceneState> {
  return batch('camera', nodes, node =>
    node.type === 'camera' ? setCamera(node.id, withField(node.camera, name, value)) : null,
  )
}

/**
 * The sprite's own parameters. A node of another type is left alone rather than patched, exactly
 * as `editMesh` refuses to give a light a geometry.
 */
export function setSprite(id: string, sprite: SpriteDescriptor): NodeEdit {
  return editPart('sprite', id, 'sprite', { sprite })
}

/**
 * What an imported model plays: its lanes, and the blocks inside each. No lane at all puts it
 * back to its rest pose.
 *
 * The whole set is written rather than one lane patched, for the reason `setModelTextures` states:
 * what the band holds IS the set, and a partial write would leave the revert unable to say which
 * lanes it was answering for.
 */
export function setModelLanes(id: string, lanes: readonly ClipLane[]): Command<SceneState> {
  return editModel(id, 'clips', model => {
    const rest = { ...model }
    delete rest.lanes
    // A single empty lane is exactly what the band shows a model that has never played anything,
    // so writing one says nothing the default does not — and a rest pose stays a document that
    // holds no animation at all.
    return lanes.length > 1 || lanes.some(lane => lane.clips.length > 0) ? { ...rest, lanes } : rest
  })
}

/**
 * One block more on a model's band, at the end of its first lane.
 *
 * The lane is made if the model has none: a character that has never played anything holds no
 * lane at all, and it is exactly the one an animation is dropped on.
 */
export function addModelClip(id: string, clip: ClipRef): Command<SceneState> {
  return editModel(id, 'lanes', model => {
    const lanes = model.lanes?.length ? model.lanes : [clipLane(MAIN_LANE_ID, [])]
    const [first, ...rest] = lanes
    if (!first) return model

    return { ...model, lanes: [{ ...first, clips: [...first.clips, clip] }, ...rest] }
  })
}

/** One block gone, wherever it sat. The lane stays, empty if it has to — see `setModelLanes`. */
export function removeModelClip(id: string, clipId: string): Command<SceneState> {
  return editModel(id, 'lanes', model => ({
    ...model,
    lanes: model.lanes?.map(lane => ({
      ...lane,
      clips: lane.clips.filter(clip => clip.id !== clipId),
    })),
  }))
}

/** What covers a model — a picture, the materials it wears, or `null` for its file's own. */
export function dressModel(id: string, dress: ModelDressRef | null): Command<SceneState> {
  return editModel(id, 'dress', model => dressed(model, dress))
}

/**
 * One slot of a model's material list, the rest carried over. Emptying a slot LEAVES it — taking
 * the row away under the finger that just cleared it is not what clearing means.
 */
export function wearMaterialAt(id: string, slot: number, documentId: string): Command<SceneState> {
  return editModel(id, 'dress', model => {
    const imageAssetId =
      model.dress?.kind === 'image' ? model.dress.assetId : model.dress?.imageAssetId
    return dressed(model, {
      kind: 'materials',
      documentIds: withMaterialAt(wornMaterials(model.dress), slot, documentId),
      ...(imageAssetId ? { imageAssetId } : {}),
    })
  })
}

/** The dress written onto a model — and `materialDocumentId` dropped, which is read once and
 * never written again: left in place it would go on contradicting `dress`. */
function dressed(model: ModelRef, dress: ModelDressRef | null): ModelRef {
  const rest = { ...model }
  delete rest.dress
  delete rest.materialDocumentId
  return dress ? { ...rest, dress } : rest
}

/**
 * One field of a model's reference, with the rest of it carried over. Written once because the
 * carrying is the whole point: an edit that rebuilt the reference from `assetId` alone dropped
 * every other field a model holds — which is how a texture override vanished on the next play.
 */
function editModel(id: string, edited: string, next: (model: ModelRef) => ModelRef): NodeEdit {
  return sweep(`${edited}:${id}`, [
    { id, edit: node => (node.type === 'model' ? { ...node, model: next(node.model) } : null) },
  ])
}

/**
 * The words, the face and the three numbers that shape them. A node of another type is left
 * alone rather than patched, exactly as `editMesh` refuses to give a light a geometry.
 */
export function setText(id: string, text: TextDescriptor): NodeEdit {
  return editPart('text', id, 'text', { text })
}

/** The material a text wears — the same descriptor a mesh does, on the other node type. */
export function setTextMaterial(id: string, material: MaterialDescriptor): NodeEdit {
  return editPart('material', id, 'text', { material })
}

/** The same, spread over a selection — the text counterpart of `setMaterialOn`. */
export function setTextOn(
  nodes: readonly SceneNode[],
  changes: Partial<TextDescriptor>,
): Command<SceneState> {
  return batch('text', nodes, node =>
    node.type === 'text' ? setText(node.id, { ...node.text, ...changes }) : null,
  )
}

/** The same, spread over a selection — the sprite counterpart of `setMaterialOn`. */
export function setSpriteOn(
  nodes: readonly SceneNode[],
  changes: Partial<SpriteDescriptor>,
): Command<SceneState> {
  return batch('sprite', nodes, node =>
    node.type === 'sprite' ? setSprite(node.id, { ...node.sprite, ...changes }) : null,
  )
}

/**
 * Whether a drag may land: no loop closed, and no player module left without its body or its eye.
 * The one predicate every door reads — `canReparent` alone let a module be taken apart.
 */

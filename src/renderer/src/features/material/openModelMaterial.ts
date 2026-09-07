import { isLocalPicture, type Asset, type ModelTextureUse } from '@shared/domain/asset'
import { hasChannel } from '@shared/domain/channelTexture'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { readyForWriting } from '@/helpers/assetIntents'
import { reportFailure } from '@/services/diagnostics'
import { documentForAsset, useDocuments } from '@/stores/documents'
import { useAssets } from '@/stores/assets'
import { materialStore, useMaterials } from '@/stores/materials'
import { useProject } from '@/stores/project'
import { placeMaterialChannel } from './components/placeChannel'
import type { UnpackPort } from '@/engines/material/derive/unpackPort'
import { unpackMaterialChannels } from './unpackChannels'
import { setMaterialSetting } from '@/engines/material/commands'

/** Said of a picture no channel claims and nothing knows how to split. */
const UNCLAIMED = new Error('this picture fits in no single channel')

async function materialDocumentFor(model: {
  id: string
  name: string
}): Promise<{ id: string; created: boolean } | null> {
  const already = documentForAsset(useDocuments.getState(), model.id, 'material')
  if (already) {
    openDocument(already)
    return { id: already.id, created: false }
  }
  if (!useProject.getState().project) {
    reportFailure('assets.open', model.name, new Error('no project'))
    return null
  }
  const created = await useDocuments
    .getState()
    .create('materials', { title: model.name, sourceAssetId: model.id })
  if (!created) {
    reportFailure('assets.open', model.name, new Error('no document'))
    return null
  }
  return { id: created.id, created: true }
}

async function fillMaterial(
  documentId: string,
  pictures: readonly Asset[],
  unpack?: UnpackPort,
): Promise<boolean> {
  for (const picture of pictures) {
    if (hasChannel(picture)) placeMaterialChannel(documentId, picture, picture.map)
  }
  let split = 0
  let complete = true
  for (const picture of pictures.filter(one => !hasChannel(one))) {
    const pieces = await unpackMaterialChannels(picture, unpack)
    if (pieces.length === 0) {
      reportFailure('material.channel', picture.name, UNCLAIMED)
      complete = false
    }
    split += pieces.length
    for (const piece of pieces) {
      if (hasChannel(piece)) placeMaterialChannel(documentId, piece, piece.map)
    }
  }
  if (split > 0) await useAssets.getState().refresh()
  return complete
}

function applyModelSettings(documentId: string, settings: ModelTextureUse['settings']): void {
  const materials = useMaterials.getState()
  materials.runCommand(documentId, setMaterialSetting('color', settings.color))
  materials.runCommand(documentId, setMaterialSetting('roughness', settings.roughness))
  materials.runCommand(documentId, setMaterialSetting('metalness', settings.metalness))
  materials.runCommand(documentId, setMaterialSetting('normalScale', settings.normalScale))
  materials.runCommand(documentId, setMaterialSetting('aoIntensity', settings.aoIntensity))
  materials.runCommand(documentId, setMaterialSetting('emissive', settings.emissive))
  materials.runCommand(
    documentId,
    setMaterialSetting('emissiveIntensity', settings.emissiveIntensity),
  )
}

/**
 * Assembles a model's own pictures into ONE material, opens it, and answers its document id — the
 * caller puts that id on the slot the gesture came from. A second call comes back to the tab
 * rather than reassembling it.
 *
 * **Not an `AssetIntent`**: `ready` and `takes` are synchronous, and which pictures came out of
 * the mesh takes a catalogue query. Offering it in the shelf menu means a synchronous store first.
 */
export async function openModelMaterial(
  model: { id: string; name: string; settings?: ModelTextureUse['settings'] },
  pictures: readonly Asset[],
  /** The GPU pass that splits a packed picture. A port for the reason `UnpackPort` is one. */
  unpack?: UnpackPort,
): Promise<string | null> {
  /**
   * Asked BEFORE a tab is made, the way `openAsset` asks it: a picture the cloud still holds has
   * no file to decode, and `placeMaterialChannel` refuses it one by one. Left to it, the gesture
   * would open a document, fill nothing, and leave an empty tab where a refusal belonged.
   */
  const local = pictures.filter(isLocalPicture)
  if (local.length === 0) {
    reportFailure('assets.open', model.name, new Error('no channel to assemble'))
    return null
  }

  const document = await materialDocumentFor(model)
  if (!document) return null
  if (!document.created) return document.id
  if (!(await readyForWriting(document.id))) {
    discardMaterial(document.id)
    return null
  }
  try {
    if (!(await fillMaterial(document.id, local, unpack))) {
      discardMaterial(document.id)
      return null
    }
    if (model.settings) applyModelSettings(document.id, model.settings)
  } catch (error) {
    discardMaterial(document.id)
    throw error
  }

  // The tab can be closed while the GPU splits a packed picture, and `runCommand` is a no-op on a
  // document the store no longer holds: answering its id anyway would put an EMPTY material on
  // the slot the gesture came from.
  if (!materialStore.hasState(useMaterials.getState(), document.id)) {
    reportFailure('assets.open', model.name, new Error('the material was closed while it filled'))
    discardMaterial(document.id)
    return null
  }

  return document.id
}

function discardMaterial(documentId: string): void {
  useMaterials.getState().drop(documentId)
  useDocuments.getState().close(documentId)
}

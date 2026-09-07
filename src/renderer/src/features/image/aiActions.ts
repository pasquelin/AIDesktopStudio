import i18next from 'i18next'
import { aiRoleId, partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import type { FieldDescriptor } from '@shared/domain/model'
import { layerById } from '@/engines/canvas/canvasState'
import { modelForCapability } from '@/helpers/modelForCapability'
import { reportNotice } from '@/services/diagnostics'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useGeneration } from '@/stores/generation'
import { useModels } from '@/stores/models'
import { fillEditFields } from './components/aiFields'
import { offerModelsOfFamily } from '@/helpers/offerModel'
import { revealTool } from '@/helpers/revealPanel'

/** The engine, seen from an edit: it flattens, and it hands back the mask it was painted. */
export type EditHost = {
  snapshot: () => Promise<string | null>
  maskSnapshot: (layerId: string) => Promise<string | null>
}

/** What the main process does with a picture on its way to the API. */
export type EditBridge = {
  uploadAsset: (name: string, image: string) => Promise<string>
  describeModel: (modelId: string) => Promise<{ fields: readonly FieldDescriptor[] }>
}

/**
 * The five edits the canvas offers, and the EMPLOYMENT each one asks for. Declared rather than
 * branched: a sixth is one entry, and none of them names a model.
 *
 * The employment and not the family since ADR-23: a retouch reaches for the model chosen to
 * retouch with, where naming the family reached for the one text-to-image was on — the same
 * weights serve both, and the person may well have picked differently for each.
 */
export type AiEdit = 'regenerate' | 'cutout' | 'enlarge' | 'vectorize' | 'extend'

export const AI_EDITS: Readonly<Record<AiEdit, { role: AiRoleId; masked: boolean }>> = {
  regenerate: { role: aiRoleId('image', 'inpaint'), masked: true },
  cutout: { role: aiRoleId('background-removal', 'cutout'), masked: false },
  enlarge: { role: aiRoleId('upscale', 'upscale'), masked: false },
  vectorize: { role: aiRoleId('vectorization', 'vectorize'), masked: false },
  extend: { role: aiRoleId('image', 'outpaint'), masked: true },
}

async function editableModel(
  role: AiRoleId,
  bridge: EditBridge,
): Promise<{ modelId: string; fields: readonly FieldDescriptor[] } | null> {
  const modelId = modelForCapability(role)
  if (!modelId) {
    const parts = partsOfRole(role)
    if (parts) offerModelsOfFamily(parts.family)
    return null
  }
  const descriptor = await bridge.describeModel(modelId)
  if (!descriptor.fields.some(field => field.kind === 'image')) {
    revealTool('generator')
    return null
  }
  return { modelId, fields: descriptor.fields }
}

async function editValues(
  documentId: string,
  masked: boolean,
  fields: readonly FieldDescriptor[],
  host: EditHost,
  bridge: EditBridge,
) {
  const image = await host.snapshot()
  if (!image) throw new Error('this image has no picture to send yet')

  const canvas = canvasOf(useCanvases.getState(), documentId)
  const layer = layerById(canvas, canvas.activeLayerId)
  const wantsMask = fields.some(field => field.maskFrom !== undefined)
  const mask =
    masked && wantsMask && layer?.mask?.enabled === true ? await host.maskSnapshot(layer.id) : null
  if (masked && !wantsMask) reportNotice('canvas.edit', i18next.t('imageEdit.maskIgnored'))

  const imageId = await bridge.uploadAsset(`${documentId}.png`, image)
  const maskId = mask ? await bridge.uploadAsset(`${documentId}-mask.png`, mask) : null
  return fillEditFields(fields, { image: imageId, ...(maskId ? { mask: maskId } : {}) })
}

/**
 * Prepares an edit and stops there. The form is never short-circuited: the action flattens the
 * document, sends it, finds the family's default model and opens its form on the right fields —
 * and the user submits. That is what keeps every parameter of the model visible (invariant 5),
 * and what makes an edit reviewable before it is paid for.
 *
 * Returns `false` when there is nothing to prepare, so the caller can say why rather than
 * leaving a menu entry that does nothing.
 */
export async function prepareEdit(
  documentId: string,
  edit: AiEdit,
  host: EditHost,
  bridge: EditBridge,
): Promise<boolean> {
  const { role, masked } = AI_EDITS[edit]
  const editable = await editableModel(role, bridge)
  if (!editable) return false
  const { modelId, fields } = editable

  const values = await editValues(documentId, masked, fields, host, bridge)

  useModels.getState().prepare(role, modelId, values)
  useGeneration.getState().forceCapability(role)
  revealTool('generator')
  return true
}

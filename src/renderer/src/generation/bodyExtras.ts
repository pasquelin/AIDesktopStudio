import STUDIO_TYPES from '@game/api/studio.d.ts?raw'
import { reworksItsOutput } from '@shared/domain/aiCapability'
import { partsOfRole, type AiRoleId } from '@shared/domain/aiRole'
import type { FieldDescriptor, ModelFamily } from '@shared/domain/model'
import { withPixelArtPrompt } from '@shared/domain/pixelArtPrompt'
// 🛑 By `promptSpark` and never by the field's NAME: guessing by name is how a sentence lands
// in the NEGATIVE prompt, asking a model for the opposite of what was wanted.
import { promptKeyOf } from '@shared/domain/projectContext'
import { gridOf } from '@/engines/canvas/pixelGrid'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { CODE_API_FIELD, CODE_SOURCE_FIELD } from '@shared/domain/codeGeneration'
import type { FormValues } from '@/helpers/dynamicForm'
import { codeFileOf } from '@/stores/code'
import { activeImageId, activeScriptId, useDocuments } from '@/stores/documents'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import {
  promptWithComments,
  supportsGenerationComments,
  type GenerationComment,
} from '@/features/image/generationComments'

/** The grid of the image in front — `null` when no image is there, or it is not on one. */
export function gridInFront(): { columns: number; rows: number } | null {
  const documentId = activeImageId(useDocuments.getState())
  return documentId === null ? null : gridOf(canvasOf(useCanvases.getState(), documentId))
}

type Extra = (
  role: AiRoleId,
  values: FormValues,
  fields: readonly FieldDescriptor[],
  pixelArt: boolean,
) => FormValues

/**
 * What a family adds beyond the form — what the WORKSPACE holds and no model schema publishes.
 * A table rather than a branch in the panel: the compiler asks for the line of a family that arrives.
 */
const EXTRAS: Record<ModelFamily, Extra | null> = {
  /**
   * The studio's own grid, which no model schema publishes. Written HERE and not in the main:
   * `promptContext` runs a process away from the store that holds the grid, and the renderer
   * writes before it — so the order comes out subject, then style, then world, which is what a
   * model truncates from the tail of.
   */
  image: (_role, values, fields, pixelArt) => {
    const grid = pixelArt ? gridInFront() : null
    const promptKey = promptKeyOf(fields)
    if (!promptKey || typeof values[promptKey] !== 'string') return values
    return {
      ...values,
      [promptKey]:
        grid === null
          ? values[promptKey]
          : withPixelArtPrompt(values[promptKey], grid.columns, grid.rows),
    }
  },
  video: null,
  '3d': null,
  audio: null,
  material: null,
  skybox: null,
  code: (role, values) => {
    const documentId = activeScriptId(useDocuments.getState())
    // 🛑 Gated on the OPERATION, not on a script being open — see `landingOfRole`.
    const source = reworksItsOutput(role) && documentId ? codeFileOf(documentId)?.source : undefined

    // Absent rather than empty: an empty string is a script that says nothing.
    return {
      ...values,
      [CODE_API_FIELD]: STUDIO_TYPES,
      ...(source ? { [CODE_SOURCE_FIELD]: source } : {}),
    }
  },
  upscale: null,
  'background-removal': null,
  vectorization: null,
  other: null,
}

function withImageComments(
  values: FormValues,
  fields: readonly FieldDescriptor[],
  documentId: string | null,
  comments: readonly GenerationComment[] | undefined,
): FormValues {
  const promptKey = promptKeyOf(fields)
  if (!promptKey || !supportsGenerationComments(fields)) {
    return values
  }

  if (documentId === null) return values
  const canvas = canvasOf(useCanvases.getState(), documentId)
  return {
    ...values,
    [promptKey]: promptWithComments(
      typeof values[promptKey] === 'string' ? values[promptKey] : '',
      comments ?? generationCommentsOf(useGenerationComments.getState(), documentId),
      canvas,
    ),
  }
}

/** The body as it is sent: the form, plus whatever the family adds to it. */
export function withBodyExtras(
  role: AiRoleId | null,
  values: FormValues,
  {
    fields = [],
    pixelArt = true,
    imageDocumentId = activeImageId(useDocuments.getState()),
    imageComments,
  }: {
    fields?: readonly FieldDescriptor[]
    pixelArt?: boolean
    imageDocumentId?: string | null
    imageComments?: readonly GenerationComment[]
  } = {},
): FormValues {
  const family = role === null ? null : partsOfRole(role)?.family
  const extras = family ? EXTRAS[family] : null
  const extended = extras && role ? extras(role, values, fields, pixelArt) : values
  return withImageComments(extended, fields, imageDocumentId, imageComments)
}

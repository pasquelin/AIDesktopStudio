import type { FieldDescriptor } from '@shared/domain/model'
import type { FormValues } from '@/helpers/dynamicForm'
import type { CanvasHost } from './canvasHosts'
import {
  generationCommentLayerId,
  generationCommentOutlines,
  supportsGenerationComments,
  type GenerationComment,
  writtenGenerationComments,
} from './generationComments'
import { fillEditFields } from './components/aiFields'
import { isGenerationCanvasSource } from '@shared/domain/generationComment'

type CommentedImageHost = Pick<CanvasHost, 'snapshot' | 'layerSnapshot' | 'outlineMaskSnapshot'>
type Upload = (name: string, image: string) => Promise<string>

export type PreparedCommentedImage = { values: FormValues; consumed: boolean }

export function withoutGenerationCanvasSource(
  values: FormValues,
  fields: readonly FieldDescriptor[],
): FormValues {
  const imageKeys = new Set(fields.filter(field => field.kind === 'image').map(field => field.key))
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        !imageKeys.has(key) || typeof value !== 'string' || !isGenerationCanvasSource(value),
    ),
  )
}

export async function prepareCommentedImage(
  values: FormValues,
  fields: readonly FieldDescriptor[],
  comments: readonly GenerationComment[],
  host: CommentedImageHost,
  upload: Upload,
  documentId: string,
): Promise<PreparedCommentedImage> {
  const written = writtenGenerationComments(comments)
  const clean = withoutGenerationCanvasSource(values, fields)
  if (written.length === 0 || !supportsGenerationComments(fields)) {
    return { values: clean, consumed: false }
  }

  const source = await commentSource(host, written)
  const image = source.image
  if (!image) return { values: clean, consumed: false }

  const imageId = await upload(`${documentId}${source.isolated ? '-layer' : ''}.png`, image)
  const maskId = await commentMask(host, fields, written, upload, documentId)

  return {
    values: {
      ...clean,
      ...fillEditFields(fields, { image: imageId, ...(maskId ? { mask: maskId } : {}) }),
    },
    consumed: true,
  }
}

async function commentSource(
  host: CommentedImageHost,
  comments: readonly GenerationComment[],
): Promise<{ image: string | null; isolated: boolean }> {
  const layerId = generationCommentLayerId(comments)
  const layer = layerId ? await host.layerSnapshot(layerId) : null
  return { image: layer ?? (await host.snapshot()), isolated: layer !== null }
}

async function commentMask(
  host: CommentedImageHost,
  fields: readonly FieldDescriptor[],
  comments: readonly GenerationComment[],
  upload: Upload,
  documentId: string,
): Promise<string | null> {
  const outlines = generationCommentOutlines(comments)
  if (outlines.length === 0 || !fields.some(field => field.maskFrom !== undefined)) return null
  const mask = await host.outlineMaskSnapshot(outlines)
  return mask ? await upload(`${documentId}-comments-mask.png`, mask) : null
}

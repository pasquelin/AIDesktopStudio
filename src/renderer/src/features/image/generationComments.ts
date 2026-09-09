import type { Point, Size } from '@/engines/core/geometry'
import { formatPercent } from '@/helpers/format'
import { layerById, type CanvasState } from '@/engines/canvas/canvasState'
import type { FieldDescriptor } from '@shared/domain/model'
import { promptKeyOf } from '@shared/domain/projectContext'
import { digest } from '@shared/hash'

export type GenerationComment = {
  id: string
  at: Point
  /** What the area is called, in the person's own words. Absent until they name it. */
  title?: string
  text: string
  layerId?: string
  outline?: readonly Point[]
}

/** What a note can be done to, wherever it is drawn — the four travel together. */
export type GenerationCommentActions = {
  onChange: (id: string, text: string) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
  onGenerate?: (id: string) => void
}

export function commentFor(id: string, at: Point, layerId: string | null): GenerationComment {
  return { id, at, text: '', ...(layerId === null ? {} : { layerId }) }
}

/** From the ID and not the position: removing the first would repaint every one below it. The
 * ANGLE alone — chroma and lightness stay in `index-foundation.css`. */
export function commentHue(id: string): number {
  return parseInt(digest(id).slice(-8), 16) % 360
}

export function writtenGenerationComments(
  comments: readonly GenerationComment[],
): readonly GenerationComment[] {
  return comments.filter(comment => comment.text.trim().length > 0)
}

export function generationCommentLayerId(comments: readonly GenerationComment[]): string | null {
  const written = writtenGenerationComments(comments)
  const layerId = written[0]?.layerId
  return layerId !== undefined && written.every(comment => comment.layerId === layerId)
    ? layerId
    : null
}

export function generationCommentOutlines(
  comments: readonly GenerationComment[],
): readonly (readonly Point[])[] {
  return writtenGenerationComments(comments).flatMap(comment =>
    comment.outline && comment.outline.length > 2 ? [comment.outline] : [],
  )
}

export function supportsGenerationComments(fields: readonly FieldDescriptor[]): boolean {
  return (
    promptKeyOf(fields) !== undefined &&
    fields.some(field => field.kind === 'image' && field.maskFrom === undefined)
  )
}

function locationOf(comment: GenerationComment, canvas: Size | CanvasState): string {
  const x = formatPercent(comment.at.x / canvas.width, 'en')
  const y = formatPercent(comment.at.y / canvas.height, 'en')
  const layer = comment.layerId && 'layers' in canvas ? layerById(canvas, comment.layerId) : null
  const scope = layer ? `layer "${layer.name}"` : 'whole image'
  // The name belongs to the SCOPE, quoted as the layer already is — never as a `Title: ` prefix
  // on the instruction, which a title holding a colon reads as a second one.
  const named = comment.title?.trim() ? `area "${comment.title.trim()}", ` : ''
  return `${named}${scope}, ${comment.outline ? 'outlined area, ' : ''}anchored at ${x} × ${y}`
}

export function promptWithComments(
  prompt: string,
  comments: readonly GenerationComment[],
  canvas: Size | CanvasState,
): string {
  const written = writtenGenerationComments(comments).map(
    (comment, index) => `${index + 1}. ${comment.text.trim()} (${locationOf(comment, canvas)})`,
  )

  return written.length === 0 ? prompt : `${prompt}\n\nImage comments:\n${written.join('\n')}`
}

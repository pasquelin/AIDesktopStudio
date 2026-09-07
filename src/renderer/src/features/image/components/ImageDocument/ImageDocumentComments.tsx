import type { CanvasView } from '@/engines/canvas/viewport'
import type { Size } from '@/engines/core/geometry'
import type { GenerationComment } from '../../generationComments'
import { ImageDocumentComment } from './ImageDocumentComment'

export type ImageDocumentCommentsProps = {
  comments: readonly GenerationComment[]
  view: CanvasView
  size: Size
  onChange: (id: string, text: string) => void
  onRemove: (id: string) => void
  onGenerate?: (id: string) => void
}

export function ImageDocumentComments(props: ImageDocumentCommentsProps) {
  return props.comments.map((comment, index) => (
    <ImageDocumentComment
      key={comment.id}
      comment={comment}
      number={index + 1}
      view={props.view}
      size={props.size}
      onChange={props.onChange}
      onRemove={props.onRemove}
      onGenerate={props.onGenerate}
    />
  ))
}

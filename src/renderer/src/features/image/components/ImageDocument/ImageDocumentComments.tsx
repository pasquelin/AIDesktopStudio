import type { CanvasView } from '@/engines/canvas/viewport'
import type { Size } from '@/engines/core/geometry'
import type { GenerationComment, GenerationCommentActions } from '../../generationComments'
import { ImageDocumentComment } from './ImageDocumentComment'

export type ImageDocumentCommentsProps = GenerationCommentActions & {
  comments: readonly GenerationComment[]
  view: CanvasView
  size: Size
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
      onRename={props.onRename}
      onRemove={props.onRemove}
      onGenerate={props.onGenerate}
    />
  ))
}

import { mdiClose, mdiCreationOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { GENERATION_COMMENT_TEXT_MAX } from '@shared/domain/generationComment'
import { ToolButton } from '@/components/ToolButton'
import type { CanvasView } from '@/engines/canvas/viewport'
import type { Size } from '@/engines/core/geometry'
import { TIP_TOP } from '@/helpers/tooltip'
import type { GenerationComment } from '../../generationComments'

type ImageDocumentCommentProps = {
  comment: GenerationComment
  number: number
  view: CanvasView
  size: Size
  onChange: (id: string, text: string) => void
  onRemove: (id: string) => void
  onGenerate?: (id: string) => void
}

export function ImageDocumentComment(props: ImageDocumentCommentProps) {
  const { t } = useTranslation()
  const { comment } = props
  return (
    <>
      {comment.outline && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
          <polyline
            className="stroke-comment-mark fill-none"
            strokeWidth="var(--sc-comment-outline)"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={comment.outline
              .map(point =>
                [
                  props.view.viewport.x + point.x * props.view.viewport.scale,
                  props.view.viewport.y + point.y * props.view.viewport.scale,
                ].join(','),
              )
              .join(' ')}
          />
        </svg>
      )}
      <div
        className="generation-comment-note bg-comment-note border-comment-note-border text-comment-note-content pointer-events-auto absolute z-10 flex flex-col border"
        style={{
          left: props.view.viewport.x + comment.at.x * props.view.viewport.scale,
          top: props.view.viewport.y + comment.at.y * props.view.viewport.scale,
          transform: `translate(${comment.at.x > props.size.width / 2 ? '-100%' : '0'}, ${comment.at.y > props.size.height / 2 ? '-100%' : '0'})`,
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex w-full items-center gap-1.5">
          <span className="border-comment-note-border text-tiny flex size-(--sc-control-inline) shrink-0 items-center justify-center rounded-full border font-medium">
            {props.number}
          </span>
          <span className="flex-1" />
          {props.onGenerate && (
            <ToolButton
              icon={mdiCreationOutline}
              variant="row"
              acts
              accented
              disabled={comment.text.trim().length === 0}
              label={t('imageComments.generate')}
              description={t('imageComments.generateHint')}
              tooltip={TIP_TOP}
              onClick={() => props.onGenerate?.(comment.id)}
            />
          )}
          <ToolButton
            icon={mdiClose}
            variant="row"
            acts
            label={t('imageComments.remove')}
            description={t('imageComments.removeHint')}
            tooltip={TIP_TOP}
            onClick={() => props.onRemove(comment.id)}
          />
        </div>
        <textarea
          className="text-comment-note-content min-h-(--sc-comment-note-text) w-full resize-none bg-transparent text-xs leading-normal outline-none"
          data-sc="field:image.generationComment"
          aria-label={t('imageComments.edit')}
          autoFocus={comment.text.length === 0}
          value={comment.text}
          placeholder={t('imageComments.placeholder')}
          maxLength={GENERATION_COMMENT_TEXT_MAX}
          onChange={event => props.onChange(comment.id, event.target.value)}
        />
      </div>
    </>
  )
}

import type { CSSProperties } from 'react'
import { mdiClose, mdiCreationOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import {
  GENERATION_COMMENT_TEXT_MAX,
  GENERATION_COMMENT_TITLE_MAX,
} from '@shared/domain/generationComment'
import { MENU_RAISED } from '@/components/styles'
import { ToolButton } from '@/components/ToolButton'
import { cn } from '@/helpers/cn'
import type { CanvasView } from '@/engines/canvas/viewport'
import type { Point, Size } from '@/engines/core/geometry'
import { TIP_TOP } from '@/helpers/tooltip'
import { commentHue, type GenerationComment } from '../../generationComments'

/** Document units, spelled once: the outline never changes after the mask came back. */
const outlinePoints = (outline: readonly Point[]): string =>
  outline.map(point => `${point.x},${point.y}`).join(' ')

/** Nothing here reads a prop, so it is built once rather than per comment per pan frame. */
const NOTE = cn(
  MENU_RAISED,
  'generation-comment generation-comment-note text-text',
  'bg-comment-note border-comment-note-border',
  // The one being written comes forward: notes overlap, and without this the last one created
  // covers whichever the hand is actually in.
  'pointer-events-auto absolute z-10 gap-2 p-2 focus-within:z-20',
)

type ImageDocumentCommentProps = {
  comment: GenerationComment
  number: number
  view: CanvasView
  size: Size
  onChange: (id: string, text: string) => void
  onRename: (id: string, title: string) => void
  onRemove: (id: string) => void
  onGenerate?: (id: string) => void
}

export function ImageDocumentComment(props: ImageDocumentCommentProps) {
  const { t } = useTranslation()
  const { comment } = props
  // Its own hue, on the outline and on the note: the four colours of `index-foundation.css` all
  // compose from this one angle, so posting it is all a comment does about its colour. Cast
  // because React types no custom property, the same reason `appRegion.ts` casts.
  const hue = { '--sc-comment-hue': commentHue(comment.id) } as CSSProperties
  return (
    <>
      {comment.outline && (
        <svg
          aria-hidden
          className="generation-comment pointer-events-none absolute inset-0 size-full"
          style={hue}
        >
          <polygon
            className="fill-comment-mark-overlay stroke-comment-mark"
            strokeWidth="var(--sc-comment-outline)"
            strokeLinecap="round"
            strokeLinejoin="round"
            // Placed by a TRANSFORM, never by recomputed points: a mask outline runs to the 512
            // `boundedOutline` allows, and rebuilding them per pan frame cost 46 µs per comment.
            vectorEffect="non-scaling-stroke"
            transform={`translate(${props.view.viewport.x} ${props.view.viewport.y}) scale(${props.view.viewport.scale})`}
            points={outlinePoints(comment.outline)}
          />
        </svg>
      )}
      <div
        className={NOTE}
        style={{
          ...hue,
          left: props.view.viewport.x + comment.at.x * props.view.viewport.scale,
          top: props.view.viewport.y + comment.at.y * props.view.viewport.scale,
          transform: `translate(${comment.at.x > props.size.width / 2 ? '-100%' : '0'}, ${comment.at.y > props.size.height / 2 ? '-100%' : '0'})`,
        }}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex w-full items-center gap-1.5">
          <span className="border-comment-note-border text-text text-tiny flex size-(--sc-control-inline) shrink-0 items-center justify-center rounded-full border font-medium">
            {props.number}
          </span>
          <input
            className="text-text placeholder:text-muted min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
            data-sc="field:image.generationCommentTitle"
            aria-label={t('imageComments.title')}
            value={comment.title}
            placeholder={t('imageComments.titlePlaceholder')}
            maxLength={GENERATION_COMMENT_TITLE_MAX}
            onChange={event => props.onRename(comment.id, event.target.value)}
          />
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
          className="text-text placeholder:text-muted min-h-(--sc-comment-note-text) w-full resize-none bg-transparent text-xs leading-normal outline-none"
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

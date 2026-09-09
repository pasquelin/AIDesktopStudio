import { useMemo, type CSSProperties } from 'react'
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
import {
  commentHue,
  type GenerationComment,
  type GenerationCommentActions,
} from '../../generationComments'

/** Document units, spelled once: the outline never changes after the mask came back. */
const outlinePoints = (outline: readonly Point[]): string =>
  outline.map(point => `${point.x},${point.y}`).join(' ')

/** What the two fields of a note share: no surface of their own, the note IS the surface. */
const NOTE_FIELD = 'text-text placeholder:text-muted bg-transparent text-xs outline-none'

/** Nothing here reads a prop, so it is built once rather than per comment per pan frame. */
const NOTE = cn(
  MENU_RAISED,
  'generation-comment generation-comment-note text-text',
  'bg-comment-note border-comment-note-border',
  // The one being written comes forward: notes overlap, and without this the last one created
  // covers whichever the hand is actually in.
  'pointer-events-auto absolute z-10 gap-2 p-2 hover:z-20 focus-within:z-20',
)

type ImageDocumentCommentProps = GenerationCommentActions & {
  comment: GenerationComment
  number: number
  view: CanvasView
  size: Size
}

export function ImageDocumentComment(props: ImageDocumentCommentProps) {
  const { t } = useTranslation()
  const { comment } = props
  // Held across renders: the note re-renders on every pan frame, and `digest` is a BigInt walk.
  // Cast because React types no custom property, the same reason `appRegion.ts` casts.
  const hue = useMemo(
    () => ({ '--sc-comment-hue': commentHue(comment.id) }) as CSSProperties,
    [comment.id],
  )
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
            className={cn(NOTE_FIELD, 'min-w-0 flex-1 text-sm font-bold')}
            data-sc="field:image.generationCommentTitle"
            aria-label={t('imageComments.title')}
            // `?? ''` and not `title ?? ''` upstream: an undefined value hands React an
            // UNCONTROLLED field, which then keeps whatever was typed after a re-render.
            value={comment.title ?? ''}
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
          className={cn(
            NOTE_FIELD,
            'min-h-(--sc-comment-note-text) w-full resize-none leading-normal',
          )}
          data-sc="field:image.generationComment"
          aria-label={t('imageComments.edit')}
          // The DEMAND takes the caret, not the name: a note is worth opening for what it asks,
          // and naming the area is the step one skips more often than not.
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

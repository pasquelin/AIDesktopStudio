import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Viewport } from '@/engines/timeline/timelineGeometry'
import type { AnimationRow } from '@/engines/timeline/bandRows'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { TimelineHeaderColumn } from '../../../../timeline/components/Timeline/TimelineHeaderColumn'
import { AnimationHeadersRow } from './AnimationHeadersRow'

export type AnimationHeadersProps = {
  documentId: string
  rows: readonly AnimationRow[]
}

/** A camera on air is out: its rank is the document's law, not an arrangement of the sheet. */
function shownSubjects(rows: readonly AnimationRow[]): string[] {
  return rows.filter(row => row.kind === 'subject' && !row.bars).map(row => row.id)
}

/**
 * The column beside the band: one line per row, aligned with the row it names.
 *
 * The name and the switches are stacked, never laid side by side. Side by side is what the old
 * panel did, and six non-shrinking buttons in a 140 px column left the name exactly zero pixels
 * wide — no track ever showed what it drove.
 */
export function AnimationHeaders({ documentId, rows }: AnimationHeadersProps) {
  const { t } = useTranslation()
  const scrollTop = useAnimationViews(
    state => animationViewOf(state, documentId).viewport.scrollTop,
  )
  // Memoised on `rows`, whose identity the panel keeps stable: this column re-renders on every
  // frame of playback, and two arrays allocated per frame is two arrays nobody reads.
  const shown = useMemo(() => shownSubjects(rows), [rows])

  // Read out of the store rather than subscribed to: the column asks for the whole viewport only
  // at the moment of a gesture, and a subscription would redraw every line on a zoom.
  const viewportNow = useCallback(
    () => animationViewOf(useAnimationViews.getState(), documentId).viewport,
    [documentId],
  )
  const setViewport = useCallback(
    (next: Viewport) => useAnimationViews.getState().setViewport(documentId, next),
    [documentId],
  )

  return (
    <TimelineHeaderColumn
      scrollTop={scrollTop}
      label={t('animation.rowList')}
      viewportNow={viewportNow}
      setViewport={setViewport}
    >
      {rows.map(row => (
        <AnimationHeadersRow key={row.id} documentId={documentId} row={row} shown={shown} />
      ))}
    </TimelineHeaderColumn>
  )
}

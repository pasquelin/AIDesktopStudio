import { mdiGrid } from '@mdi/js'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { MonitorFrame } from '@/components/MonitorFrame'
import { usePixelPreview } from '@/hooks/usePixelPreview'

export type PixelArtPreviewProps = {
  documentId: string
  /** The artwork's own measurements, in cells — see `cellsSpanning`. */
  columns: number
  rows: number
  cell: number
}

/**
 * How wide an artwork may be, in cells, before one pixel per cell stops fitting anywhere. Past it
 * the browser would scale the picture down to the panel, which is the blurring the mode fights.
 */
const PREVIEW_MAX_CELLS = 256

/**
 * The artwork at its own resolution: ONE screen pixel per cell, so a 64² sprite and a 1024²
 * worked in blocks of 16 both show 64 × 64. A "1:1" meaning the document at 100 % would put a
 * thousand pixels in an inspector section.
 */
export function PixelArtPreview({ documentId, columns, rows, cell }: PixelArtPreviewProps) {
  const { t } = useTranslation()
  const surface = useRef<HTMLCanvasElement>(null)
  const shown = columns <= PREVIEW_MAX_CELLS && rows <= PREVIEW_MAX_CELLS
  usePixelPreview(documentId, surface, shown ? columns : 0, shown ? rows : 0, cell)

  return (
    // A flex box, or the frame's own `flex-1` has nothing to stretch into and the picture
    // collapses to no height at all.
    <div className="flex aspect-square">
      <MonitorFrame role={t('inspector.pixelArtPreview')} toolbar={null}>
        {shown ? (
          <canvas
            ref={surface}
            width={columns}
            height={rows}
            // `pixelated`, or the browser blurs the very edges the mode exists to keep hard.
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain [image-rendering:pixelated]"
          />
        ) : (
          <EmptyState icon={mdiGrid} message={t('inspector.pixelArtPreviewTooWide')} />
        )}
      </MonitorFrame>
    </div>
  )
}

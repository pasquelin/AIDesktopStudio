import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { oneOf } from '@shared/guards'
import { NumberField } from '@/components/NumberField'
import { PropertyRow } from '@/components/PropertyRow'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { ValueGrid } from '@/components/ValueGrid/ValueGrid'
import { BIT_DEPTHS, COLOR_MODES, type CanvasState } from '@/engines/canvas/canvasState'
import {
  resizeCanvas,
  resizeImage,
  setCanvasBitDepth,
  setCanvasColorMode,
  setCanvasDpi,
  setPixelCell,
} from '@/engines/canvas/commands'
import { cellFor, cellsSpanning } from '@/engines/canvas/pixelGrid'
import type { Size } from '@/engines/core/geometry'
import { toggleView } from '@/features/image/canvasView'
import { PixelArtPreview } from '@/features/image/components/PixelArt/PixelArtPreview'
import { MAX_PICTURE_SIDE } from '@/features/image/pictureSize'
import { formatDecimal } from '@/helpers/format'
import { useDocumentEdit } from '@/hooks/useDocumentEdit'
import { useCanvases } from '@/stores/canvases'
import { canvasViewOf, useCanvasViews } from '@/stores/canvasViews'

export type CanvasInspectorProps = { documentId: string; canvas: CanvasState }

/** The sizes a sprite is drawn at, in cells. Powers of two, which is what a tile sheet wants. */
const ART_PRESETS: readonly number[] = [16, 32, 64, 128]

/** The cell the mode opens on, for a document that has never been on a grid. */
const FIRST_CELL = 1

/** The document itself, above whichever layer is armed. */
export function CanvasInspector({ documentId, canvas }: CanvasInspectorProps) {
  const { t, i18n } = useTranslation()
  const edit = useDocumentEdit(useCanvases, documentId)
  // Which of the two resizes a size means. Session state: it is a way of asking, not a fact
  // about the picture, and ⌘Z must not hand it back.
  const [resample, setResample] = useState(false)
  // Held until the field is left: a size is recut on every value a field emits, and typing
  // `1024` would cut the picture to one pixel on its first digit — pixels ⌘Z cannot give back.
  const [pending, setPending] = useState<Size | null>(null)
  const lastCell = useRef(canvas.pixelCell ?? FIRST_CELL)
  // A way of looking, so it lives with the rulers and the guides rather than in the document.
  const grid = useCanvasViews(state => canvasViewOf(state, documentId).grid)

  const cell = canvas.pixelCell
  const size: Size = pending ?? canvas
  const columns = cellsSpanning(canvas.width, cell ?? FIRST_CELL)
  const rows = cellsSpanning(canvas.height, cell ?? FIRST_CELL)

  const sizing = {
    onGestureStart: edit.gesture.onGestureStart,
    onGestureEnd: (): void => {
      if (pending) {
        edit.run(
          resample
            ? resizeImage(pending.width, pending.height)
            : resizeCanvas(pending.width, pending.height, { x: 0, y: 0 }),
        )
      }
      setPending(null)
      edit.gesture.onGestureEnd()
    },
  }

  const setCell = (next: number | null): void => {
    if (next !== null) lastCell.current = next
    edit.run(setPixelCell(next))
  }
  const resolve = (wanted: number, side: number): void => setCell(cellFor(side, wanted))

  return (
    <>
      <PropertySection title={t('inspector.document')} scId="canvas">
        <NumberField
          label={t('inspector.fields.width')}
          scId="canvas.width"
          value={size.width}
          min={1}
          max={MAX_PICTURE_SIDE}
          step={1}
          onChange={width => setPending({ width, height: size.height })}
          {...sizing}
        />

        <NumberField
          label={t('inspector.fields.height')}
          scId="canvas.height"
          value={size.height}
          min={1}
          max={MAX_PICTURE_SIDE}
          step={1}
          onChange={height => setPending({ width: size.width, height })}
          {...sizing}
        />

        <ToggleField
          label={t('inspector.resample')}
          scId="canvas.resample"
          value={resample}
          onChange={setResample}
        />

        <NumberField
          label={t('inspector.dpi')}
          scId="canvas.dpi"
          value={canvas.dpi}
          min={1}
          step={1}
          onChange={dpi => edit.run(setCanvasDpi(dpi))}
          {...edit.gesture}
        />

        <SelectField
          label={t('inspector.colorMode')}
          scId="canvas.colorMode"
          value={canvas.colorMode}
          options={COLOR_MODES.map(mode => ({
            value: mode,
            label: t(`inspector.colorMode_${mode}`),
          }))}
          onChange={mode => edit.run(setCanvasColorMode(mode))}
        />

        <SelectField
          label={t('inspector.bitDepth')}
          scId="canvas.bitDepth"
          value={String(canvas.bitDepth)}
          options={BIT_DEPTHS.map(depth => ({
            value: String(depth),
            label: t('inspector.bitDepthBits', { count: depth }),
          }))}
          onChange={chosen =>
            edit.run(setCanvasBitDepth(oneOf(BIT_DEPTHS, Number(chosen), canvas.bitDepth)))
          }
        />
      </PropertySection>

      <PropertySection title={t('inspector.pixelArt')} scId="canvas.pixelArt">
        <ToggleField
          label={t('inspector.pixelArtMode')}
          scId="canvas.pixelArt.on"
          value={cell !== null}
          onChange={on => setCell(on ? lastCell.current : null)}
        />

        {cell !== null && (
          <>
            <PixelArtPreview documentId={documentId} columns={columns} rows={rows} cell={cell} />

            <PropertyRow label={t('inspector.artResolution')}>
              <ValueGrid
                options={ART_PRESETS.map(preset => ({
                  value: preset,
                  label: formatDecimal(preset, i18n.language, { digits: 0 }),
                }))}
                chosen={columns}
                label={t('inspector.artResolution')}
                onChoose={preset => resolve(preset, canvas.width)}
                scId="canvas.pixelArt.preset"
              />
            </PropertyRow>

            <NumberField
              label={t('inspector.artColumns')}
              scId="canvas.pixelArt.columns"
              value={columns}
              min={1}
              step={1}
              onChange={wanted => resolve(wanted, canvas.width)}
              {...edit.gesture}
            />

            <NumberField
              label={t('inspector.artRows')}
              scId="canvas.pixelArt.rows"
              value={rows}
              min={1}
              step={1}
              onChange={wanted => resolve(wanted, canvas.height)}
              {...edit.gesture}
            />

            <ToggleField
              label={t('inspector.pixelArtGrid')}
              scId="canvas.pixelArt.grid"
              value={grid}
              onChange={() => toggleView(documentId, 'grid')}
            />

            <NumberField
              label={t('inspector.pixelSize')}
              scId="canvas.pixelArt.cell"
              value={cell}
              min={1}
              step={1}
              onChange={setCell}
              {...edit.gesture}
            />
          </>
        )}
      </PropertySection>
    </>
  )
}

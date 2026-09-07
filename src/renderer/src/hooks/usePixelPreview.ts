import { useEffect, type RefObject } from 'react'
import { canvasHost } from '@/features/image/canvasHosts'
import { useCanvases } from '@/stores/canvases'

/**
 * Long enough that a stroke draws once when it ends rather than at every point of it, short
 * enough that letting go of the pointer and looking at the preview reads as one gesture.
 */
const SETTLE_MS = 120

/**
 * Draws the document into `surface`, one pixel per CELL, whenever its state comes to rest.
 *
 * The bitmap never crosses a render: it is drawn and freed inside one pass, so nothing can hold
 * a picture this hook has already closed.
 */
export function usePixelPreview(
  documentId: string,
  surface: RefObject<HTMLCanvasElement | null>,
  columns: number,
  rows: number,
  cell: number,
): void {
  useEffect(() => {
    // 🛑 No canvas is mounted past `PREVIEW_MAX_CELLS`, so the retry below would never be
    // satisfied: a full-document extraction every 120 ms, for as long as the panel stays open.
    if (columns === 0 || rows === 0) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let live = true
    // Nothing is on screen yet, so an empty answer is worth asking again for: a document opens
    // before its engine mounts and before its layers are read back, and no store write follows
    // either — without this the preview stays blank until an unrelated edit happens to land.
    let awaited = true
    let latest = 0

    const draw = async (): Promise<void> => {
      const asked = (latest += 1)
      let picture: ImageBitmap | null = null
      try {
        picture = (await canvasHost(documentId)?.flattenBitmap()) ?? null
        const context = surface.current?.getContext('2d')
        // Overtaken by a later extraction, which has already drawn: a slow one landing after it
        // would put a stale frame on screen for good.
        if (!live || asked !== latest) return
        if (!picture || !context) return void (awaited && settle())

        awaited = false
        context.clearRect(0, 0, columns, rows)
        // The SOURCE rectangle is a whole number of cells, which the document may not be: scaling
        // `width` into `columns` samples a fraction of a cell off, and near the right edge that
        // slips a whole cell — the last one is then never drawn at all.
        context.imageSmoothingEnabled = false
        context.drawImage(picture, 0, 0, columns * cell, rows * cell, 0, 0, columns, rows)
      } catch {
        // Swallowed on purpose, and this is the whole of why: a lost context or a refused
        // extraction leaves the last picture standing, and the next settle draws again.
      } finally {
        picture?.close()
      }
    }

    const settle = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void draw()
      }, SETTLE_MS)
    }

    settle()
    // 🛑 The HISTORY as well as the state, and the history is the half that matters: painting
    // leaves `states` untouched — the pixels are in a texture and the command only records a
    // patch — so on the state alone the preview never refreshed after a single stroke.
    const stop = useCanvases.subscribe((state, before) => {
      if (
        state.states[documentId] !== before.states[documentId] ||
        state.histories[documentId] !== before.histories[documentId]
      )
        settle()
    })

    return () => {
      live = false
      if (timer) clearTimeout(timer)
      stop()
    }
  }, [documentId, surface, columns, rows, cell])
}

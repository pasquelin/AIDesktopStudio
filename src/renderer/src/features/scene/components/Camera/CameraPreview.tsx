import { mdiArrowExpand, mdiArrowCollapse } from '@mdi/js'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ToolButton } from '@/components/ToolButton'
import { activeCameraAt } from '@/engines/scene/cameraShots'
import { selectedNodes } from '@/engines/scene/sceneState'
import { previewRect, type PaneRect } from '@/engines/viewport/panes'
import { cn } from '@/helpers/cn'
import { TIP_LEFT } from '@/helpers/tooltip'
import { usePointerDrag } from '@/hooks/usePointerDrag'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/** What a film is written at, so the preview frames what a render would actually hold. */
const FILM_ASPECT = 16 / 9

/** Same numbers, same object: a measure that changed nothing must not redraw the picture. */
function sameRect(a: PaneRect, b: PaneRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

/**
 * What the selected camera films, drawn in the corner of the viewport.
 *
 * The rectangle is decided HERE and handed to the engine: the frame around the picture is DOM,
 * and two rectangles agreeing by construction is the only way it stays around it.
 */
export function CameraPreview({ documentId }: { documentId: string }) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const drag = usePointerDrag<{ x: number; y: number }>()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [picture, setPicture] = useState<PaneRect | null>(null)

  const nodes = useScenes(state => sceneOf(state, documentId).nodes)
  const selectedIds = useScenes(state => sceneOf(state, documentId).selectedIds)
  const timeline = useScenes(state => sceneOf(state, documentId).animation)
  // Two narrow selectors rather than the whole view: `setPlayhead` replaces that object on every
  // frame of playback, and this component would re-render sixty times a second for two fields.
  const previewSize = useSceneViews(state => sceneViewOf(state, documentId).previewSize)
  const previewOffset = useSceneViews(state => sceneViewOf(state, documentId).previewOffset)

  const anchor = selectedNodes(nodes, selectedIds).at(-1) ?? null
  const camera = anchor?.type === 'camera' ? anchor : null
  const cameraId = camera?.id ?? null
  // Memoised on the camera's ID rather than the node: moving it hands over a fresh object, and
  // the engine would be told about a rectangle that has not changed a pixel.
  const rect: PaneRect | null = useMemo(
    () =>
      cameraId
        ? previewRect(size.width, size.height, FILM_ASPECT, previewSize, previewOffset)
        : null,
    [cameraId, previewSize, previewOffset, size],
  )

  // `activeCameraAt` and nothing else, so the badge cannot disagree with the montage or the film.
  // The ANSWER is subscribed to rather than the head: reading the head off the view re-rendered
  // this sixty times a second to draw a word that changes twice in a sequence.
  const onAir = useSceneViews(
    state =>
      cameraId !== null &&
      activeCameraAt(timeline, nodes, sceneViewOf(state, documentId).playhead) === cameraId,
  )
  const full = previewSize === 'full'

  useEffect(() => {
    const node = host.current
    if (!node) return

    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (!box) return

      // Same numbers, same object: a resize that changes neither must not redraw the frame, nor
      // hand the engine a rectangle it is already drawing into.
      setSize(current =>
        current.width === box.width && current.height === box.height
          ? current
          : { width: box.width, height: box.height },
      )
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  /**
   * Where the picture goes: the frame's INSIDE, measured rather than computed. The bar and the
   * footer are sized by the density gauges, so subtracting them by arithmetic here would be a
   * second answer to a question the layout has already answered — and wrong at the other density.
   */
  useLayoutEffect(() => {
    const inside = body.current
    const outside = host.current
    if (!inside || !outside) {
      setPicture(null)
      return
    }

    const box = inside.getBoundingClientRect()
    const origin = outside.getBoundingClientRect()
    const measured = {
      x: box.x - origin.x,
      y: box.y - origin.y,
      width: box.width,
      height: box.height,
    }
    setPicture(current => (current && sameRect(current, measured) ? current : measured))
  }, [rect, full, onAir])

  useEffect(() => {
    sceneEngineOf(documentId)?.setCameraPreview(
      cameraId && picture ? { cameraNodeId: cameraId, rect: picture, full } : null,
    )
  }, [documentId, cameraId, picture, full])

  // The engine outlives this component: left open, it would draw over a document nobody sees.
  // Its OWN effect, on the document alone: closing the preview frees its chain and the programs
  // compiled for it, and a rectangle that follows the pointer changes on every move.
  useEffect(() => {
    const engine = sceneEngineOf(documentId)
    return () => engine?.setCameraPreview(null)
  }, [documentId])

  const onGrab = (event: ReactPointerEvent<HTMLDivElement>): void => {
    // Not from the button in the corner: its press bubbles up here, and a preview that jumps
    // while somebody aims at Enlarge is a preview nobody can enlarge.
    if (event.target instanceof Element && event.target.closest('button')) return

    drag.start(event, { x: event.clientX, y: event.clientY })
  }

  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const held = drag.matching(event)
    if (!held) return

    // Read before the origin moves on: the offset is the step this move made, not the whole drag.
    const { x, y } = held
    held.x = event.clientX
    held.y = event.clientY
    useSceneViews.getState().setPreviewOffset(documentId, {
      x: previewOffset.x + event.clientX - x,
      y: previewOffset.y + event.clientY - y,
    })
  }

  function Preview() {
    return (
      <div ref={host} className="pointer-events-none absolute inset-0">
        {camera && rect && (
          <div
            /**
             * The border, the radius and the floating shadow the studio gives everything it floats
             * — `Toolbar` and `TooltipHost` are the two that settled that.
             *
             * NO background, and it is not an oversight: the picture is drawn by the ENGINE, on a
             * canvas that sits UNDER the DOM, so a surface here covers it — the preview went black
             * the moment one was put on. Nothing over the picture may be opaque.
             *
             * The radius is the SMALL one for the same reason: the picture is a hard rectangle the
             * DOM cannot clip, so it overruns a rounded corner by the sagitta — 1,6 px at 4, 12 px
             * at the large radius, which reads as a broken frame.
             */
            className={cn(
              /**
               * TWO strokes, and the reason is arithmetic. This frame is read against the VIEWPORT,
               * which `index.css` sets LIGHTER than every surface of the studio — so no dark grey
               * can carry it: measured 18/08 against #33363b, `border` is 1,00:1, `panel` 1,44 and
               * pure black 1,73, under the 3:1 WCAG 1.4.11 asks of a glyph that informs. A light
               * grey reaches it and belongs to nothing else here.
               *
               * So the outer two pixels are `panel`, which is what the eye reads as a frame of this
               * app, and a one-pixel `muted` ring inside carries the contrast. `furniture` and not
               * `floating`: a preview is set down in the view, it does not hover over it.
               *
               * The same at every moment, on air included: what says a camera is live is the badge
               * that says so in words, and a second signal in colour says it twice.
               */
              'border-panel ring-muted pointer-events-auto absolute border-2 ring-1 ring-inset',
              full ? '' : 'rounded-(--radius-sc-sm) shadow-(--sc-shadow-furniture)',
              full ? '' : 'cursor-grab active:cursor-grabbing',
            )}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            // The WHOLE preview is the handle — a title bar would be the one place a hand does not
            // aim for. It also takes the pointer whole: without that the press fell through to the
            // viewport, which read it as an orbit and turned the scene instead of moving this.
            onPointerDown={full ? undefined : onGrab}
            onPointerMove={onDragMove}
            onPointerUp={drag.cancel}
            onPointerCancel={drag.cancel}
            onLostPointerCapture={drag.cancel}
          >
            {/* What the engine paints into: the frame WHOLE, so the picture is the preview and not
              a letterbox between two bars. Everything else floats over it. */}
            <div ref={body} className="absolute inset-0" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-2 py-1">
              <span className="text-text text-tiny min-w-0 truncate">{camera.name}</span>
              {onAir && (
                <span className="bg-elevated text-text text-tiny shrink-0 rounded-(--radius-sc-sm) px-1">
                  {t('scene.onAir')}
                </span>
              )}
            </div>
            <div className="absolute right-0 bottom-0 p-1">
              <ToolButton
                icon={full ? mdiArrowCollapse : mdiArrowExpand}
                label={full ? t('scene.previewInset') : t('scene.previewFull')}
                tooltip={TIP_LEFT}
                variant="header"
                onClick={() =>
                  useSceneViews.getState().setPreviewSize(documentId, full ? 'inset' : 'full')
                }
              />
            </div>
          </div>
        )}
      </div>
    )
  }
  return Preview()
}

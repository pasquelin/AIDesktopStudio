import type { ScreenBox } from '@/engines/scene/marqueeSelection'

export type SceneDocumentMarqueeProps = {
  /** In CSS pixels from the canvas' top-left corner, or `null` while nothing is being dragged. */
  box: ScreenBox | null
}

/**
 * The rectangle being dragged, over the canvas the renderer owns. In the DOM rather than in the
 * scene: an outline through WebGL costs a pass a frame, and answers to no camera and no light.
 */
export function SceneDocumentMarquee({ box }: SceneDocumentMarqueeProps) {
  if (!box) return null

  return (
    <div
      aria-hidden
      data-sc="section:scene.marquee"
      className="border-accent bg-accent-soft pointer-events-none absolute border"
      style={{
        left: box.minX,
        top: box.minY,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
      }}
    />
  )
}

import { DRAGGABLE } from '@/helpers/appRegion'

/**
 * The band a window without any title bar is moved by — as tall as the studio's own bar, and
 * showing nothing at all.
 *
 * Apart from `WindowTitleBar`, which NAMES a window and insets its words past the traffic
 * lights: over a game there is nothing to name, and what is being judged is the picture. Its own
 * component all the same, so the drag is spelled in one place — `one-window-title-bar.test.ts`
 * holds that, and a band laid out by hand beside a canvas is exactly what it is for.
 */
export function WindowDragBand() {
  return <div style={DRAGGABLE} className="absolute inset-x-0 top-0 h-(--sc-title-bar)" />
}

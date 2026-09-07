export type WindowArea = { x: number; y: number; width: number; height: number }

/**
 * 🛑 Electron's `center` reads display BOUNDS on macOS alone, so the menu bar and the Dock push
 * the window up by half their height — 96px measured here. `Center()` reads the work area elsewhere.
 */
export function centredIn(area: WindowArea, size: { width: number; height: number }): WindowArea {
  // Clamped, because these windows are frameless and not resizable: taller than the work area,
  // their footer sits off the screen with no way to reach it.
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)

  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
  }
}

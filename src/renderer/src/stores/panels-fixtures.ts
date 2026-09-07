import type { OpenByZone } from '@pasquelin/panels'
import { familyOf, type ToolId, type ToolSurface } from '@shared/domain/tool'
import type { ToolState } from '@/helpers/toolRegistry'
import { declarePanelsOf } from '@/features/shell/panelSpecs'
import { LAYOUT_KEY } from '@/features/shell/layoutStorage'
import { panelsStore } from './panels'

/**
 * A chassis holding nothing — `panelsStore` is a module singleton, so a test inherits the last.
 * 🛑 Not `reset()`: that one SETTLES the view in front against the registry it finds, and a
 * registry emptied first settles it EMPTY, which nothing re-opens.
 */
export function resetChassis(): void {
  // A `<Shell>` mounted after another one wrote its arrangement would restore it instead of
  // settling, and the two tests would describe the same window.
  globalThis.localStorage?.removeItem(LAYOUT_KEY)
  // `defaults` explicitly: `setState` MERGES, and the initial state names no such key — so the
  // halves one file settled with would settle the next one's, for another surface entirely.
  panelsStore.setState({ ...panelsStore.getInitialState(), defaults: undefined })
}

/**
 * The chassis as `<Shell>` would have set it up for that surface, without mounting it.
 *
 * Named an arrangement, it is taken as the reader's own and nothing settles it; left out, the
 * halves are settled the way a first launch settles them. `state` says what the studio holds —
 * left out, the stores are read, so set them first.
 */
export function chassisFor(
  surface: ToolSurface,
  open?: OpenByZone<ToolId>,
  state?: ToolState,
): void {
  resetChassis()
  if (open !== undefined) panelsStore.setState({ views: { [familyOf(surface)]: open } })
  declarePanelsOf(surface, state)
}

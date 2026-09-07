import { createPanelsStore } from '@pasquelin/panels'
import type { ToolId } from '@shared/domain/tool'

/**
 * The chassis' own store, built here rather than left to `<Panels>`, because the studio drives
 * it from OUTSIDE React: the native menu, the MCP server and the assistant all bring a panel
 * forward without a component in hand.
 *
 * A module singleton, like every other store here — one window, one chassis.
 */
export const panelsStore = createPanelsStore<ToolId>()

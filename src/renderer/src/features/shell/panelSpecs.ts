import type { PanelSpec } from '@pasquelin/panels'
import i18next from 'i18next'
import { familyOf, type ToolId, type ToolSurface } from '@shared/domain/tool'
import { toolsOffered, toolStateOf, toolTitleKey, type ToolState } from '@/helpers/toolRegistry'
import { fillsActions } from './components/toolComponents'
import { panelsStore } from '@/stores/panels'
import { DEFAULT_OPEN } from './defaultOpen'

/**
 * What the chassis is told about the panels a surface offers.
 *
 * ONE mapping, read by the shell that renders them and by anything driving the studio without a
 * window. Written twice, the two lists had to agree about a shape the compiler does not check —
 * and the headless one was already naming panels by their raw id where the window translates.
 */
export function panelSpecsOf(
  surface: ToolSurface,
  state: ToolState,
  title: (id: ToolId) => string,
): PanelSpec<ToolId>[] {
  return toolsOffered(surface, state).map(tool => ({
    id: tool.id,
    zone: tool.zone,
    slot: tool.slot,
    title: title(tool.id),
    opens: tool.opens,
    solo: tool.solo,
    // Here rather than beside the JSX: this is the list a run with no window reads.
    fillActions: fillsActions(tool.id),
  }))
}

/**
 * Declares them into the store and brings the surface's view forward — what `<Shell>` does by
 * rendering `<Panel>`, for a run that has no window.
 *
 * Reads the stores RIGHT NOW unless told otherwise: call it once the answers a `requires` asks
 * about are set, and again whenever they change — `subscribeToToolState`.
 */
export function declarePanelsOf(surface: ToolSurface, state: ToolState = toolStateOf()): void {
  const chassis = panelsStore.getState()

  // `i18next` rather than `useTranslation`: this has no React tree, and the instance is the one
  // the window uses — so a headless run says what a reader would see, pseudo-locale included.
  chassis.declare(panelSpecsOf(surface, state, id => i18next.t(toolTitleKey(id))))
  // Written before `setView`, which settles the view it ARRIVES at off the store's own defaults —
  // what `<Panels>` does with its `defaultOpen`, for a run that has no provider to do it. Only
  // when it moves: this runs again on every answer a `requires` asks about.
  const defaults = DEFAULT_OPEN[familyOf(surface)]
  if (defaults !== chassis.defaults) panelsStore.setState({ defaults })
  // Before `setView`, which settles the view it arrives at against WHERE the panels stand, and
  // a view settles once. The surface and not the family: the rails are arranged per section.
  chassis.setPlacementScope(surface)
  chassis.setView(familyOf(surface))
  chassis.settle()
}

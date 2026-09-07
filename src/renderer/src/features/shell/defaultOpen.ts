import type { OpenByZone } from '@pasquelin/panels'
import type { SurfaceFamily, ToolId } from '@shared/domain/tool'

/**
 * Which halves a surface starts with, naming no panel. 🛑 Left to the chassis, a half opens only
 * where something is declared for it AT THAT INSTANT, and a view settles ONCE: Video entered
 * through Image kept the montage shut for good, and the home its Explorer until a project opened.
 */
export const DEFAULT_OPEN: Record<SurfaceFamily, OpenByZone<ToolId>> = {
  workspaces: {
    left: { primary: null, secondary: null },
    right: { primary: null, secondary: null },
    bottomRight: { primary: null },
  },
  home: {
    left: { primary: null, secondary: null },
    // No lower right: an inspector has no selection to read on a screen holding no document.
    right: { primary: null },
    bottomRight: { primary: null },
  },
}

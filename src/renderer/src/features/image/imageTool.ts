import type { CanvasTool } from '@/engines/canvas/canvasTool'
import type { ToolbarItem } from '@/components/Toolbar/tools'

/**
 * One entry of the image toolbar. Declared apart from the list that holds it: a tool written in
 * its own module would otherwise import the list back, and `import-cycles.test.ts` keeps that at
 * zero.
 */
export type ImageTool = ToolbarItem & { tool: CanvasTool }

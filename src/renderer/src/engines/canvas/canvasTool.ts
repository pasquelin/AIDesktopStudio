/**
 * Which tool the canvas is holding.
 *
 * On its own rather than beside the engine: `brush` needs to name the tools its table covers, and
 * the engine needs that table, which is a cycle even spelt `import type`. Nothing of the engine —
 * Pixi included — comes with the union, so a caller that only wanted a name still gets one.
 */
export type CanvasTool =
  | 'select'
  | 'smartSelect'
  | 'smartComment'
  | 'move'
  | 'crop'
  | 'shape'
  | 'brush'
  /**
   * The same gesture as the brush, with the edge the bundle promises it: a pencil is hard, and
   * nothing on screen sets that — which is why it is a tool rather than a mode of the brush.
   */
  | 'pencil'
  | 'text'
  | 'comment'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'hand'

/** The two promptable tools: one gesture, one prompt, only the mask's use told apart. */
export type SmartTool = Extract<CanvasTool, 'smartSelect' | 'smartComment'>

// A `Record` and not two comparisons: a hand-written `===` per member stays green while a third
// tool falls through to the brush.
const SMART_TOOLS: Record<SmartTool, true> = { smartSelect: true, smartComment: true }

/** A `string`, because a gesture kind asks too and its union is not this one. `hasOwn` and not
 * `in`, which walks the prototype and would read `'toString'` as a tool. */
export function isSmartTool(tool: string): tool is SmartTool {
  return Object.hasOwn(SMART_TOOLS, tool)
}

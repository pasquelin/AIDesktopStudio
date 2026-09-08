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

/**
 * The two promptable tools: the same gesture and the same prompt, only what is done with the mask
 * told apart. Four places read this, and one that listed a single member left the other blind.
 */
export type SmartTool = Extract<CanvasTool, 'smartSelect' | 'smartComment'>

// A `Record` and not two comparisons: the union and its members cannot part company, where a
// hand-written `===` per member stays green while a third tool falls through to the brush.
const SMART_TOOLS: Record<SmartTool, true> = { smartSelect: true, smartComment: true }

/** `in` takes any string, which is what lets a gesture kind ask without widening the signature. */
export function isSmartTool(tool: CanvasTool | string): tool is SmartTool {
  return tool in SMART_TOOLS
}

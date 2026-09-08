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
 * The two promptable tools: one click or one drag, the same prompt, and only what is done with
 * the mask told apart. Named once because four places read it — the gesture it opens, the box the
 * overlay draws, the ants it keeps marching, and the prompt it commits — and a fifth reader that
 * listed one of the two left the other dragging blind.
 */
export type SmartTool = Extract<CanvasTool, 'smartSelect' | 'smartComment'>

export function isSmartTool(tool: string): tool is SmartTool {
  return tool === 'smartSelect' || tool === 'smartComment'
}

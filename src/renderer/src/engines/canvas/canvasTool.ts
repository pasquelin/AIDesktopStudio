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

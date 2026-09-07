import type { HandlePart } from './threeFactory'

/** A rail anchor or tangent selected by its owning node and point index. */
export type PickedPathPoint = { nodeId: string; index: number; part?: HandlePart }

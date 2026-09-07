import { clamp } from '@shared/numeric'
import type { CanvasState, GroupLayer, Layer } from './canvasLayers'

export function isGroup(layer: Layer): layer is GroupLayer {
  return layer.kind === 'group'
}
/**
 * Every layer of the stack, groups included, depth first and bottom first. Groups nest, so no
 * caller may assume `state.layers` is the whole document.
 */
export function allLayers(layers: readonly Layer[]): Layer[] {
  return layers.flatMap(layer => (isGroup(layer) ? [layer, ...allLayers(layer.children)] : [layer]))
}

export function layerById(state: CanvasState, id: string | null): Layer | null {
  if (id === null) return null
  return allLayers(state.layers).find(layer => layer.id === id) ?? null
}

/**
 * The layers sharing a parent with `id`, rebuilt by `change`. Grouping made every neighbour
 * operation — reorder, merge down, duplicate — a question about one level of the tree, not about
 * `state.layers`, which is only the root.
 *
 * Returns the tree unchanged when nothing carries that id.
 */
export function updateSiblings(
  layers: readonly Layer[],
  id: string,
  change: (siblings: readonly Layer[], index: number) => Layer[],
): Layer[] {
  const index = layers.findIndex(layer => layer.id === id)
  if (index >= 0) return change(layers, index)

  return layers.map(layer =>
    isGroup(layer) ? { ...layer, children: updateSiblings(layer.children, id, change) } : layer,
  )
}

/**
 * Whether the stack would still hold something to paint on once `layer` leaves it — its whole
 * subtree, for a group.
 *
 * Counting the paintable layers of the document is not enough, and that is the trap this exists
 * for: a folder holding every pixel layer answers "two paintable" while deleting it empties the
 * document. `deserializeCanvas` reads an empty stack back as `DEFAULT_CANVAS`, silently resetting
 * the size, the colour mode and the bit depth of the picture.
 *
 * Read from both sides on purpose: `removeLayer` refuses the command, and the panel greys the
 * button and the menu row rather than offering a gesture that would do nothing.
 */
export function canRemoveLayer(layers: readonly Layer[], layer: Layer): boolean {
  const leaving = new Set(allLayers([layer]).map(one => one.id))

  return allLayers(layers).some(one => !isGroup(one) && !leaving.has(one.id))
}

/**
 * Whether there is a layer under the armed one, at its own level — what a merge needs.
 *
 * Read from both sides like `canRemoveLayer`: the menu greys its row with it, and the handler
 * runs the same test before merging.
 */
export function canMergeDown(state: CanvasState): boolean {
  const active = state.activeLayerId
  return active !== null && layerBelow(state.layers, active) !== null
}

/**
 * Whether a mask can be cut from the selection: a layer to wear it, and a region to cut.
 *
 * The selection is passed rather than read, because it lives in the VIEW store and this module
 * knows nothing of stores — the two halves of the question are held apart in the app.
 */
export function canMaskFromSelection(state: CanvasState, hasSelection: boolean): boolean {
  return hasSelection && state.activeLayerId !== null
}

/**
 * Whether a layer may hang at that level: under a GROUP, never under itself, and never under one
 * of its own descendants — the last would cut the branch out of the tree.
 *
 * Read from both sides like `canRemoveLayer`: `moveLayer` refuses the command by handing the state
 * back untouched, and a caller that cannot tell that apart from a move reports every miss as done.
 */
export function canMoveLayer(state: CanvasState, id: string, parentId: string | null): boolean {
  const layer = layerById(state, id)
  if (!layer) return false
  if (parentId === null) return true
  if (parentId === id) return false

  const parent = layerById(state, parentId)
  if (!parent || !isGroup(parent)) return false

  return !(isGroup(layer) && allLayers(layer.children).some(child => child.id === parentId))
}

/**
 * The layer directly under `id` at its own level — what `mergeDown` merges into. Within the level,
 * never through the wall of the group it sits in, exactly as the command reads it.
 *
 * `null` when it is the bottom of its level, or when nothing carries that id: there is nothing to
 * merge into, and the caller has to offer nothing rather than a menu entry that does nothing.
 */
export function layerBelow(layers: readonly Layer[], id: string): Layer | null {
  const index = layers.findIndex(layer => layer.id === id)
  if (index >= 0) return layers[index - 1] ?? null

  for (const layer of layers) {
    if (!isGroup(layer)) continue
    const found = layerBelow(layer.children, id)
    if (found) return found
  }
  return null
}

/** Rebuilds the tree with one layer replaced, wherever it sits. `null` removes it. */
export function mapLayers(
  layers: readonly Layer[],
  change: (layer: Layer) => Layer | null,
): Layer[] {
  const next: Layer[] = []
  for (const layer of layers) {
    const changed = change(layer)
    if (changed === null) continue
    next.push(
      isGroup(changed) ? { ...changed, children: mapLayers(changed.children, change) } : changed,
    )
  }
  return next
}

export function clampOpacity(value: number): number {
  if (Number.isNaN(value)) return 1
  return clamp(value, 0, 1)
}

export function serializeCanvas(state: CanvasState): string {
  return JSON.stringify(state)
}

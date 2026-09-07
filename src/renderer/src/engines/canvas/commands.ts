import type { AdjustmentStack } from '@shared/domain/adjustments'
import type { BlendMode } from '@shared/domain/canvasBlend'
import { clamp } from '@shared/numeric'
import { replaceField, type Command } from '../core/history'
import type { Point, Size } from '../core/geometry'
import {
  allLayers,
  canMoveLayer,
  canRemoveLayer,
  clampOpacity,
  isGroup,
  layerById,
  mapLayers,
  updateSiblings,
  wholeBox,
  type CanvasState,
  type Guide,
  type Layer,
  type LayerLocks,
  type ShapeLayer,
  type TextLayer,
  type Transform,
} from './canvasState'
import { restructure } from './commandsStructure'

/**
 * Layer edits, on the same Command model as the scene ones. `engines/core/history` runs them —
 * it is generic and shared, never duplicated per engine.
 *
 * A command captures what it needs to revert as it is applied, not as it is built.
 */
export function addLayer(layer: Layer, targetId?: string): Command<CanvasState> {
  return {
    id: `layer:add:${layer.id}`,
    apply: state => {
      const layers =
        targetId && layerById(state, targetId)
          ? updateSiblings(state.layers, targetId, (siblings, index) =>
              insertedAt(siblings, layer, index + 1),
            )
          : [...state.layers, layer]
      return {
        ...state,
        layers,
        activeLayerId: layer.id,
      }
    },
    revert: state => withoutLayer(state, layer.id),
  }
}

export function removeLayer(id: string): Command<CanvasState> {
  // Restructuring: removing a group takes its whole subtree, which no field-by-field inverse
  // would put back at the right depth.
  return restructure(
    `layer:remove:${id}`,
    // Guarded here as well as in `refuses`: a redo replays `apply` against whatever state the
    // stack has reached, which is not the one the command was pushed against.
    state => (refusesRemoval(state, id) ? state : withoutLayer(state, id)),
    state => refusesRemoval(state, id),
  )
}

/**
 * A document with an empty stack cannot be painted on — and a GROUP carries its subtree out with
 * it, so what matters is what stays, not how many layers the document has. See `canRemoveLayer`,
 * which the panel reads to grey the same gesture.
 */
function refusesRemoval(state: CanvasState, id: string): boolean {
  const target = layerById(state, id)
  return !target || !canRemoveLayer(state.layers, target)
}

/**
 * Removing the active layer moves the selection to a neighbour, never leaves it dangling —
 * checked against what survives, not against the id removed: taking a group takes its children
 * with it, and one of those may be the armed one.
 */
function withoutLayer(state: CanvasState, id: string): CanvasState {
  const index = allLayers(state.layers).findIndex(layer => layer.id === id)
  const layers = mapLayers(state.layers, layer => (layer.id === id ? null : layer))

  const remaining = allLayers(layers).filter(layer => !isGroup(layer))
  if (remaining.some(layer => layer.id === state.activeLayerId)) return { ...state, layers }

  const neighbour = remaining[Math.min(index, remaining.length - 1)]
  return { ...state, layers, activeLayerId: neighbour?.id ?? null }
}

/**
 * Anywhere in the tree: `parentId` names the group receiving the layer, `null` the root, and
 * `index` its place among that level's layers once the moved one has left — bottom first, the
 * order the stack is drawn in, which the panel reverses on its way to the eye.
 *
 * A group refuses to enter its own subtree. The drop would carry the receiving group along with
 * it, and every layer under it would leave the document with no way back.
 */
export function moveLayer(
  id: string,
  parentId: string | null,
  index: number,
): Command<CanvasState> {
  return restructure(
    `layer:move:${id}`,
    state => {
      const layer = layerById(state, id)
      // Guarded here as well as in `refuses`, for the state a redo replays against.
      if (!layer || !canMoveLayer(state, id, parentId)) return state

      const without = mapLayers(state.layers, current => (current.id === id ? null : current))
      if (parentId === null) return { ...state, layers: insertedAt(without, layer, index) }

      return {
        ...state,
        layers: mapLayers(without, current =>
          current.id === parentId && isGroup(current)
            ? { ...current, children: insertedAt(current.children, layer, index) }
            : current,
        ),
      }
    },
    state => !layerById(state, id) || !canMoveLayer(state, id, parentId),
  )
}

export function setLayerBlend(id: string, blend: BlendMode): Command<CanvasState> {
  return patch(`layer:blend:${id}`, id, { blend })
}

export function setLayerLocks(id: string, locks: LayerLocks): Command<CanvasState> {
  return patch(`layer:locks:${id}`, id, { locked: locks })
}

export function setLayerFillOpacity(id: string, fillOpacity: number): Command<CanvasState> {
  return patch(`layer:fill-opacity:${id}`, id, { fillOpacity: clampOpacity(fillOpacity) })
}

export function setLayerClipped(id: string, clipped: boolean): Command<CanvasState> {
  return patch(`layer:clip:${id}`, id, { clipped })
}

// Clamped rather than passed to `splice` as it comes: a negative index counts from the end there,
// so a drop above the first row would land at the top of the stack instead of the bottom.
function insertedAt(siblings: readonly Layer[], layer: Layer, index: number): Layer[] {
  const layers = [...siblings]
  layers.splice(clamp(index, 0, layers.length), 0, layer)
  return layers
}

export function setLayerOpacity(id: string, opacity: number): Command<CanvasState> {
  return patch(`layer:opacity:${id}`, id, { opacity: clampOpacity(opacity) })
}

export function setLayerVisible(id: string, visible: boolean): Command<CanvasState> {
  return patch(`layer:visible:${id}`, id, { visible })
}

export function renameLayer(id: string, name: string): Command<CanvasState> {
  return patch(`layer:rename:${id}`, id, { name })
}

/**
 * Gives a layer a mask, or takes it away. Its pixels belong to the engine like the layer's own;
 * what the stack records is only that there is one, and whether it is hiding anything.
 */
export function setLayerMask(
  id: string,
  mask: { enabled: boolean; linked: boolean } | undefined,
): Command<CanvasState> {
  return patch(`layer:mask:${id}`, id, { mask })
}

/**
 * The grading values of an adjustment layer. Typed apart from `patch`, which is spelled on the
 * fields every kind shares — this one belongs to a single kind of layer.
 */
export function setLayerAdjustment(id: string, values: AdjustmentStack): Command<CanvasState> {
  let previous: AdjustmentStack | null = null

  return {
    id: `layer:adjust:${id}`,
    apply: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => {
        if (layer.id !== id || layer.kind !== 'adjustment') return layer
        previous ??= layer.values
        return { ...layer, values }
      }),
    }),
    revert: state => ({
      ...state,
      layers: mapLayers(state.layers, layer =>
        layer.id === id && layer.kind === 'adjustment' && previous
          ? { ...layer, values: previous }
          : layer,
      ),
    }),
  }
}

/** The words of a caption, and how they are set. Its own command, like the grading values. */
export function setLayerText(
  id: string,
  changes: Partial<
    Pick<
      TextLayer,
      'text' | 'font' | 'size' | 'color' | 'box' | 'align' | 'lineHeight' | 'tracking'
    >
  >,
): Command<CanvasState> {
  let previous: TextLayer | null = null

  // Here rather than in the caller: a drag, a grip and an MCP client all land on this one line,
  // and the panel's fields keep every digit they are handed.
  const sized = changes.box ? { ...changes, box: wholeBox(changes.box) } : changes

  return {
    id: `layer:text:${id}`,
    apply: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => {
        if (layer.id !== id || layer.kind !== 'text') return layer
        previous ??= layer
        return { ...layer, ...sized }
      }),
    }),
    revert: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => (layer.id === id && previous ? previous : layer)),
    }),
  }
}

/**
 * A caption's box and where it starts, together. One command rather than two: a north or west
 * grip moves both at once, and two entries would be two steps of undo for one pull.
 */
export function resizeCaption(id: string, box: Size, at: Point): Command<CanvasState> {
  let previous: TextLayer | null = null
  // Both halves or neither: rounding the box while the origin stayed fractional moved the edge a
  // west or north grip must hold still, which shift-resizing and a turned caption both reach.
  const corner = { x: Math.round(at.x), y: Math.round(at.y) }
  const sized = wholeBox(box)

  return {
    id: `layer:caption-box:${id}`,
    apply: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => {
        if (layer.id !== id || layer.kind !== 'text') return layer
        previous ??= layer
        return { ...layer, box: sized, transform: { ...layer.transform, ...corner } }
      }),
    }),
    revert: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => (layer.id === id && previous ? previous : layer)),
    }),
  }
}

/** The paint of a shape, and how many points it has. Its own command, like a caption's words. */
export function setLayerShape(
  id: string,
  changes: Partial<Pick<ShapeLayer, 'sides' | 'fill' | 'stroke'>>,
): Command<CanvasState> {
  let previous: ShapeLayer | null = null

  return {
    id: `layer:shape:${id}`,
    apply: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => {
        if (layer.id !== id || layer.kind !== 'shape') return layer
        previous ??= layer
        return { ...layer, ...changes }
      }),
    }),
    revert: state => ({
      ...state,
      layers: mapLayers(state.layers, layer => (layer.id === id && previous ? previous : layer)),
    }),
  }
}

/** The whole transform at once: the inspector's fields all write into the same object. */
export function setLayerTransform(id: string, transform: Transform): Command<CanvasState> {
  return patch(`layer:transform:${id}`, id, { transform })
}

/**
 * One shape for every single-field edit: they all revert by putting the old value back. Typed on
 * the fields shared by every kind, so a patch cannot turn a group into something else.
 */
function patch(
  commandId: string,
  id: string,
  fields: Partial<Omit<Layer, 'kind'>>,
): Command<CanvasState> {
  let previous: Layer | null = null

  return {
    id: commandId,
    apply: state => {
      previous = allLayers(state.layers).find(layer => layer.id === id) ?? null
      return mapLayer(state, id, layer => ({ ...layer, ...fields }))
    },
    revert: state => (previous ? mapLayer(state, id, () => previous ?? undefined) : state),
  }
}

function mapLayer(
  state: CanvasState,
  id: string,
  change: (layer: Layer) => Layer | undefined,
): CanvasState {
  return {
    ...state,
    layers: mapLayers(state.layers, layer => (layer.id === id ? (change(layer) ?? layer) : layer)),
  }
}

/**
 * Where the moved layer ends up, as an absolute position rather than a step: commands merged
 * into one gesture keep the first one's `revert` and the last one's `apply`, so a relative one
 * would rewind a single pointer move.
 */
export function translateLayer(id: string, x: number, y: number): Command<CanvasState> {
  let previous: Transform | null = null

  return {
    id: `layer:translate:${id}`,
    apply: state => {
      const target = layerById(state, id)
      if (!target) return state
      previous = target.transform
      return mapLayer(state, id, layer => ({ ...layer, transform: { ...layer.transform, x, y } }))
    },
    revert: state =>
      previous
        ? mapLayer(state, id, layer => ({ ...layer, transform: previous ?? layer.transform }))
        : state,
  }
}

/** What the engine will be asked to paint back when this entry is stepped over. */
export type PixelPort = {
  /** `false` when the patch has been thrown away, and the entry can no longer be replayed. */
  restore: (patchId: string, side: 'before' | 'after') => boolean
  /**
   * Told when a replay found nothing. The tiles can go without anyone hearing — a resurface
   * drops them all — and the entry left behind is a ⌘Z that visibly does nothing.
   */
  lost: (patchId: string) => void
}

/**
 * A stroke, as far as the history is concerned. The pixels are not in the state and never will
 * be — the engine kept the tiles either side of the gesture, and this only tells it which way to
 * replay them.
 */
export function paintPixels(patchId: string, port: PixelPort): Command<CanvasState> {
  // The layer already holds the "after" pixels when the entry is pushed; blitting them back on
  // that first apply would be a GPU pass for a texture that is already right.
  let recorded = true

  return {
    id: `pixels:${patchId}`,
    apply: state => {
      if (recorded) recorded = false
      else if (!port.restore(patchId, 'after')) port.lost(patchId)
      return state
    },
    revert: state => {
      if (!port.restore(patchId, 'before')) port.lost(patchId)
      return state
    },
  }
}

/**
 * Idempotent on purpose: pulling a guide off a ruler and dragging it is one gesture, and the
 * commands it emits coalesce on this id. A second one has to move the guide it already laid
 * down, not stack another beside it.
 */
export function addGuide(guide: Guide): Command<CanvasState> {
  let replaced: Guide | null = null

  return {
    id: `guide:add:${guide.id}`,
    apply: state => {
      // Applied over a guide that already carries this id, the inverse is a move back, not a
      // removal — and one gesture reaching this branch is enough to lose a guide on ⌘Z.
      replaced = state.guides.find(other => other.id === guide.id) ?? null
      return { ...state, guides: [...withoutGuide(state.guides, guide.id), guide] }
    },
    revert: state => {
      const rest = withoutGuide(state.guides, guide.id)
      return { ...state, guides: replaced ? [...rest, replaced] : rest }
    },
  }
}

function withoutGuide(guides: readonly Guide[], id: string): Guide[] {
  return guides.filter(guide => guide.id !== id)
}

/** Dragging a guide is one gesture, so the commands it emits coalesce on this id. */
export function moveGuide(id: string, position: number): Command<CanvasState> {
  let previous: number | null = null

  return {
    id: `guide:move:${id}`,
    apply: state => {
      previous = state.guides.find(guide => guide.id === id)?.position ?? null
      return withGuide(state, id, position)
    },
    revert: state => (previous === null ? state : withGuide(state, id, previous)),
  }
}

function withGuide(state: CanvasState, id: string, position: number): CanvasState {
  return {
    ...state,
    guides: state.guides.map(guide => (guide.id === id ? { ...guide, position } : guide)),
  }
}

/** Dropping a guide back on its ruler removes it, which is how every editor deletes one. */
export function removeGuide(id: string): Command<CanvasState> {
  let previous: Guide | null = null
  let index = 0

  return {
    id: `guide:remove:${id}`,
    apply: state => {
      index = state.guides.findIndex(guide => guide.id === id)
      previous = state.guides[index] ?? null
      return { ...state, guides: withoutGuide(state.guides, id) }
    },
    // Back where it was, not on top: the stack of guides has an order, and undo must be an
    // inverse, not an approximation.
    revert: state =>
      previous === null
        ? state
        : {
            ...state,
            guides: [...state.guides.slice(0, index), previous, ...state.guides.slice(index)],
          },
  }
}

export function clearGuides(): Command<CanvasState> {
  return replaceField('guide:clear', 'guides', () => [])
}

/**
 * Folds a group, or opens it. Adds no history entry, like the selection — though an undo of the
 * edit before it does put the fold back, since a command reverts the whole layer it patched.
 */
export function collapseLayer(state: CanvasState, id: string, collapsed: boolean): CanvasState {
  return {
    ...state,
    layers: mapLayers(state.layers, layer =>
      layer.id === id && isGroup(layer) ? { ...layer, collapsed } : layer,
    ),
  }
}

/** Selection stays out of the history: nobody wants ⌘Z to give them back a selected layer. */
export function selectLayer(state: CanvasState, id: string | null): CanvasState {
  return { ...state, activeLayerId: id }
}

/**
 * Restructuring commands — grouping, merging, flattening — revert by putting the stack back.
 *
 * A stack is metadata: ids, names, opacities. The pixels are not in it, they live in the
 * engine's textures, so this is not the full-snapshot history CLAUDE.md forbids. Inverting a
 * regroup by hand would mean rebuilding a tree from a path, and getting it subtly wrong.
 */
export {
  cropToRect,
  duplicateLayer,
  flatten,
  flipImage,
  groupLayers,
  mergeDown,
  resizeCanvas,
  resizeImage,
  rotateImage,
  setCanvasBitDepth,
  setCanvasColorMode,
  setCanvasDpi,
  setPixelCell,
  ungroupLayer,
  type FlipAxis,
  type TurnPort,
} from './commandsStructure'

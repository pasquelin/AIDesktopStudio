import { replaceField, type Command } from '../core/history'
import type { Point, Size } from '../core/geometry'
import { anchoredAt, applyTo, layerMatrix } from './layerSpace'
import {
  allLayers,
  DEFAULT_CANVAS,
  groupLayer,
  isGroup,
  isRedrawn,
  layerById,
  pixelCellOf,
  pixelLayer,
  sided,
  updateSiblings,
  type BitDepth,
  type CanvasState,
  type ColorMode,
  type Layer,
  type Rect,
  type Transform,
} from './canvasState'

/**
 * Layer edits, on the same Command model as the scene ones. `engines/core/history` runs them —
 * it is generic and shared, never duplicated per engine.
 */
export function restructure(
  commandId: string,
  change: (state: CanvasState) => CanvasState,
  refuses?: (state: CanvasState) => boolean,
): Command<CanvasState> {
  let before: CanvasState | null = null

  return {
    id: commandId,
    apply: state => {
      before = state
      return change(state)
    },
    revert: () => before ?? DEFAULT_CANVAS,
    refuses,
  }
}

/**
 * Wraps the named layers in a group, at the position of the topmost of them. Selecting layers
 * that are not siblings would silently pull them out of their groups, so only top-level ones
 * are taken — the panel offers nothing else.
 */
export function groupLayers(
  ids: readonly string[],
  groupId: string,
  name: string,
): Command<CanvasState> {
  const wanted = new Set(ids)

  return restructure(`layer:group:${groupId}`, state => {
    // Top level only: a group moves whole, and pulling siblings out of one silently would be
    // a restructure nobody asked for. The panel offers nothing else.
    const members = state.layers.filter(layer => wanted.has(layer.id))
    if (members.length === 0) return state

    const last = state.layers.findLastIndex(layer => wanted.has(layer.id))
    const rest = state.layers.filter(layer => !wanted.has(layer.id))
    const group = groupLayer(groupId, name, members)

    // Where the topmost member was, counted among the layers that stay: the group must not jump
    // above what used to cover it.
    const at = state.layers.slice(0, last).filter(layer => !wanted.has(layer.id)).length
    return {
      ...state,
      layers: [...rest.slice(0, at), group, ...rest.slice(at)],
      // The topmost member, not the group: a group holds no pixels, so arming one leaves the
      // brush silently drawing nothing.
      activeLayerId: allLayers(members).findLast(layer => !isGroup(layer))?.id ?? null,
    }
  })
}

/** Dissolves a group, leaving its children where it stood. */
export function ungroupLayer(id: string): Command<CanvasState> {
  return restructure(`layer:ungroup:${id}`, state => {
    const group = layerById(state, id)
    if (!group || !isGroup(group)) return state

    const layers = updateSiblings(state.layers, id, (siblings, index) => [
      ...siblings.slice(0, index),
      ...group.children,
      ...siblings.slice(index + 1),
    ])
    const armed = allLayers(group.children).findLast(layer => !isGroup(layer))?.id
    return { ...state, layers, activeLayerId: armed ?? state.activeLayerId }
  })
}

/**
 * Merges a layer into the one below it. The pixels are the engine's to composite; what the
 * stack records is that two layers became one, keeping the lower one's name as every editor does.
 */
export function mergeDown(id: string): Command<CanvasState> {
  return restructure(`layer:merge-down:${id}`, state => {
    let merged: string | null = null

    // Within its own level: a layer merges into the one below it, not through the wall of the
    // group it sits in.
    const layers = updateSiblings(state.layers, id, (siblings, index) => {
      const below = siblings[index - 1]
      if (!below) return [...siblings]
      // The result takes the lower layer's identity, so its texture is the one kept.
      merged = below.id
      return siblings.filter((_, at) => at !== index)
    })

    return merged ? { ...state, layers, activeLayerId: merged } : state
  })
}

/** One opaque layer, named as every editor names it. Hidden layers are dropped, not merged. */
export function flatten(id: string, name: string): Command<CanvasState> {
  return restructure('layer:flatten', state => ({
    ...state,
    layers: [pixelLayer(id, name)],
    activeLayerId: id,
  }))
}

/**
 * Every id in the copy is fresh, children included. A shallow copy of a group would leave two
 * layers sharing an id — and everything downstream matches by id: one rename would rename both,
 * and `CanvasEngine` keys its textures that way, so painting one would paint the other.
 */
function copyOf(layer: Layer, id: string, name: string, newId: () => string): Layer {
  const copy = { ...layer, id, name }
  return isGroup(copy)
    ? { ...copy, children: copy.children.map(child => copyOf(child, newId(), child.name, newId)) }
    : copy
}

export function duplicateLayer(
  id: string,
  copyId: string,
  name: string,
  newId: () => string,
): Command<CanvasState> {
  return restructure(`layer:duplicate:${id}`, state => {
    const source = layerById(state, id)
    if (!source) return state

    const layers = updateSiblings(state.layers, id, (siblings, index) => {
      const next = [...siblings]
      next.splice(index + 1, 0, copyOf(source, copyId, name, newId))
      return next
    })
    return { ...state, layers, activeLayerId: copyId }
  })
}

/**
 * Moves every top-level layer, and only those: a group carries its children, so walking into it
 * would shift a nested layer once per level of nesting and tear groups away from what surrounds
 * them.
 */
function moveLayers(
  state: CanvasState,
  change: (transform: Transform, layer: Layer) => Transform,
): Layer[] {
  return state.layers.map(layer => ({ ...layer, transform: change(layer.transform, layer) }))
}

/** The corner of a layer's own pixels. One point is enough once the linear half is right. */
const HELD: Point = { x: 0, y: 0 }

/**
 * Every layer carried through a map of the whole document. The caller writes the linear half —
 * the scales, the angles — and this solves `x`/`y` so the content lands where the map sends it.
 *
 * Solved against the box the surfaces will have AFTER the change: a surface is document-sized,
 * so a resample moves the pivot `origin × box` under every layer at the same time.
 */
function remapped(
  state: CanvasState,
  size: Size,
  map: (point: Point) => Point,
  linear: (transform: Transform, layer: Layer) => Transform,
  carried: (point: Point, layer: Layer) => Point = point => point,
): CanvasState {
  const box = { width: state.width, height: state.height }

  return {
    ...state,
    width: size.width,
    height: size.height,
    layers: moveLayers(state, (transform, layer) =>
      anchoredAt(
        linear(transform, layer),
        size,
        carried(HELD, layer),
        map(applyTo(layerMatrix(transform, box), HELD)),
      ),
    ),
  }
}

/**
 * Changes the frame without touching a pixel. The layers keep their own position, so the offset
 * decides what slides out of view — this is `Canvas size`, not `Image size`.
 */
export function resizeCanvas(
  width: number,
  height: number,
  offset: { x: number; y: number },
): Command<CanvasState> {
  return restructure(
    'canvas:resize',
    state => ({
      ...state,
      width: sided(width),
      height: sided(height),
      layers: moveLayers(state, transform => ({
        ...transform,
        x: transform.x + offset.x,
        y: transform.y + offset.y,
      })),
    }),
    state => sameSize(state, width, height) && offset.x === 0 && offset.y === 0,
  )
}

function sameSize(state: CanvasState, width: number, height: number): boolean {
  return state.width === sided(width) && state.height === sided(height)
}

/** A scalar of the document, and a same value refused: a field writes on every blur. */
function documentField<K extends keyof CanvasState>(
  commandId: string,
  name: K,
  value: CanvasState[K],
): Command<CanvasState> {
  return { ...replaceField(commandId, name, () => value), refuses: state => state[name] === value }
}

/** Puts the document on a pixel grid, or takes it off one — see `CanvasState.pixelCell`. */
export function setPixelCell(cell: number | null): Command<CanvasState> {
  return documentField('canvas:pixelCell', 'pixelCell', pixelCellOf(cell))
}

export function setCanvasDpi(dpi: number): Command<CanvasState> {
  return documentField('canvas:dpi', 'dpi', sided(dpi))
}

export function setCanvasColorMode(mode: ColorMode): Command<CanvasState> {
  return documentField('canvas:colorMode', 'colorMode', mode)
}

export function setCanvasBitDepth(depth: BitDepth): Command<CanvasState> {
  return documentField('canvas:bitDepth', 'bitDepth', depth)
}

/**
 * Resamples everything. The layers scale with the frame, which is what makes this different
 * from `resizeCanvas`: the frame moves there, and the content moves here.
 *
 * `x`/`y` are SOLVED, never scaled: `CanvasEngine.resurface` carries the surfaces to the new
 * size, so the pivot — a fraction of the box — moves with them, and scaling `x` alone left the
 * content half a document away.
 *
 * Exact while the two factors agree. They differ only on a non-proportional resample of a TURNED
 * layer, where the true map is not a scale at all but a shear the transform cannot hold.
 */
export function resizeImage(width: number, height: number): Command<CanvasState> {
  return restructure(
    'canvas:resample',
    state => {
      const scaleX = sided(width) / state.width
      const scaleY = sided(height) / state.height

      return remapped(
        state,
        { width: sided(width), height: sided(height) },
        point => ({ x: point.x * scaleX, y: point.y * scaleY }),
        transform => ({
          ...transform,
          scaleX: transform.scaleX * scaleX,
          scaleY: transform.scaleY * scaleY,
        }),
      )
    },
    state => sameSize(state, width, height),
  )
}

export type FlipAxis = 'horizontal' | 'vertical'

/**
 * Mirrors the whole document. A negative scale rather than rewritten pixels: the layers keep
 * their textures, so flipping and flipping back is exactly the identity — which rewriting them
 * would not be, once resampling has rounded a pixel twice.
 *
 * The angles turn with the scale, and `x`/`y` are SOLVED rather than written: mirroring flips
 * the direction a turned layer sweeps, and `x` is not the position of the content once a scale
 * or a turn is on — writing `width - x` put the whole layer one document outside the frame.
 */
export function flipImage(axis: FlipAxis): Command<CanvasState> {
  return restructure(`canvas:flip:${axis}`, state =>
    remapped(
      state,
      { width: state.width, height: state.height },
      point =>
        axis === 'horizontal'
          ? { x: state.width - point.x, y: point.y }
          : { x: point.x, y: state.height - point.y },
      transform => ({
        ...transform,
        rotation: -transform.rotation,
        skewX: -transform.skewX,
        skewY: -transform.skewY,
        ...(axis === 'horizontal' ? { scaleX: -transform.scaleX } : { scaleY: -transform.scaleY }),
      }),
    ),
  )
}

/** The engine's half of a document-wide turn: the pixels, which no state can hold. */
export type TurnPort = { turn: (clockwise: boolean) => void }

/**
 * Turns the document a quarter turn, pixels included. The frame turns with it — a portrait
 * becomes a landscape — and each layer turns about the document's centre rather than its own.
 *
 * The PIXELS carry the turn, so what is left here is the layer's own placement conjugated by the
 * same turn: the two scales trade places, the two skews trade places and change sign, the angle
 * is untouched. Turning the transform instead would leave each texture holding the sides the
 * document no longer has, and cost half of every layer to the recut that follows.
 *
 * Except where the pixels cannot carry it: a caption and a shape are redrawn from their state, so
 * their turned texture lasts until the next edit and their own box never turned at all. Those take
 * the quarter in their ANGLE, which is what the whole document did before the pixels took over.
 */
export function rotateImage(clockwise: boolean, port: TurnPort): Command<CanvasState> {
  const turned = (state: CanvasState, way: boolean): CanvasState => {
    const turn = (point: Point): Point =>
      way ? { x: state.height - point.y, y: point.x } : { x: point.y, y: state.width - point.x }

    return remapped(
      state,
      { width: state.height, height: state.width },
      turn,
      (transform, layer) =>
        isRedrawn(layer)
          ? { ...transform, rotation: transform.rotation + (way ? Math.PI / 2 : -Math.PI / 2) }
          : {
              ...transform,
              scaleX: transform.scaleY,
              scaleY: transform.scaleX,
              skewX: -transform.skewY,
              skewY: -transform.skewX,
            },
      // A redrawn layer's content stayed where it was, so the corner it is anchored by did too.
      (point, layer) => (isRedrawn(layer) ? point : turn(point)),
    )
  }

  return {
    id: `canvas:rotate:${clockwise ? 'cw' : 'ccw'}`,
    // The pixels first, then the state that reports them — the order merging and cropping use.
    apply: state => (port.turn(clockwise), turned(state, clockwise)),
    // And back, both halves: a turn undone has to UNTURN the surfaces. Left to the caller, the
    // undo restored a portrait frame over landscape textures, and the recut that followed took
    // half of every layer.
    revert: state => (port.turn(!clockwise), turned(state, !clockwise)),
  }
}

/**
 * Cropping is the frame closing onto a rectangle. The layers deliberately do NOT move with it:
 * a surface is document-sized, and `CanvasEngine.resurface` recuts each one to the kept region,
 * so the picture is already where the new frame expects it. Displacing the transforms as well
 * would apply the same move twice and empty one side of the document.
 */
export function cropToRect(rect: Rect): Command<CanvasState> {
  return resizeCanvas(rect.width, rect.height, { x: 0, y: 0 })
}

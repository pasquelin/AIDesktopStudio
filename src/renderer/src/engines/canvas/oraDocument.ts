import {
  isOraGroup,
  isOraSurfacePath,
  ORA_MERGED_PATH,
  type OraDocument,
  type OraNode,
  type OraStack,
  type OraSurface,
} from '@shared/domain/openRaster'
import { blendOfComposite, type BlendMode } from '@shared/domain/canvasBlend'
import { isRecord } from '@shared/guards'
import type { LayerPixels } from './CanvasEngine'
import { layerPixelPath, layerPixelsNamed } from './layerPixelPath'
import {
  IDENTITY,
  isGroup,
  layerBase,
  serializeCanvas,
  type CanvasState,
  type GroupLayer,
  type Layer,
  type PixelLayer,
} from './canvasState'
import { deserializeCanvas } from './canvasStatePersistence'

const PLAIN = 'svg:src-over'

const compositeOf = (blend: BlendMode): string => (blend === 'normal' ? PLAIN : `svg:${blend}`)

function nodeOf(layer: Layer, held: ReadonlySet<string>): OraNode | null {
  const shared = {
    name: layer.name,
    x: Math.round(layer.transform.x),
    y: Math.round(layer.transform.y),
    opacity: layer.opacity,
    visible: layer.visible,
    composite: compositeOf(layer.blend),
  }

  if (isGroup(layer)) {
    return {
      ...shared,
      kind: 'group',
      isolation: layer.isolation === 'isolate' ? 'isolate' : 'auto',
      children: nodesOf(layer.children, held),
    }
  }

  // An adjustment and a text layer have no element in the standard, and no surface to stand in
  // for them: they ride in `studio` alone. The flatten already shows what they did.
  if (layer.kind !== 'pixel') return null

  const src = layerPixelPath({ layerId: layer.id, mask: false })
  // A layer with no bytes is LEFT OUT of the stack rather than named with nothing behind it —
  // a layer added seconds before ⌘S, whose surface the engine has not built. `studio` still
  // carries it, so reopening finds it.
  return held.has(src) ? { ...shared, kind: 'layer', src } : null
}

/** Top first, undoing the studio's bottom-first order — the format writes a stack the other way. */
function nodesOf(layers: readonly Layer[], held: ReadonlySet<string>): OraNode[] {
  return [...layers]
    .reverse()
    .map(layer => nodeOf(layer, held))
    .filter((node): node is OraNode => node !== null)
}

/**
 * Every surface the container will hold: one per layer texture, one per mask, and the flatten.
 *
 * Held to `isOraSurfacePath` here rather than at the boundary that would refuse the whole save:
 * one odd layer id must cost that layer's pixels, never the document.
 */
export function oraSurfacesOf(
  pixels: readonly LayerPixels[],
  merged: Uint8Array<ArrayBuffer>,
): OraSurface[] {
  const surfaces: OraSurface[] = [{ path: ORA_MERGED_PATH, png: merged }]
  for (const one of pixels) {
    const path = layerPixelPath(one)
    if (isOraSurfacePath(path) && one.data.byteLength > 0) surfaces.push({ path, png: one.data })
  }
  return surfaces
}

/**
 * The stack as OpenRaster holds it, plus what OpenRaster cannot.
 *
 * `studio` carries the whole state verbatim rather than a diff of what the stack could not say:
 * reading it back is then one `deserializeCanvas`, and no rule has to be kept in step on two
 * sides. What the standard part is for is the OTHER reader — the one that will never know this
 * field exists.
 */
export function oraStackOf(state: CanvasState, surfaces: readonly OraSurface[]): OraStack {
  return {
    width: state.width,
    height: state.height,
    nodes: nodesOf(state.layers, new Set(surfaces.map(one => one.path))),
    studio: serializeCanvas(state),
  }
}

function pixelsOf(surfaces: readonly OraSurface[]): LayerPixels[] {
  return surfaces
    .map(one => layerPixelsNamed(one.path, one.png))
    .filter((one): one is LayerPixels => one !== null && one.data.byteLength > 0)
}

/**
 * A stack the studio never wrote, turned into layers it can edit — with each layer's pixels
 * collected in the SAME pass.
 *
 * One walk rather than two: the ids are invented here, so a second walk pairing nodes with layers
 * by position would be a second place holding the same order — and the day one of them changes,
 * every layer silently gets its neighbour's pixels.
 */
function layersFromNodes(
  nodes: readonly OraNode[],
  pngOf: (src: string) => Uint8Array<ArrayBuffer> | undefined,
  found: LayerPixels[],
  at = { next: 0 },
): Layer[] {
  return [...nodes].reverse().map((node): Layer => {
    at.next += 1
    const shared = {
      ...layerBase(`ora-${at.next}`, node.name),
      visible: node.visible,
      opacity: node.opacity,
      blend: blendOfComposite(node.composite),
      transform: { ...IDENTITY, x: node.x, y: node.y },
    }

    if (isOraGroup(node)) {
      return {
        ...shared,
        kind: 'group',
        children: layersFromNodes(node.children, pngOf, found, at),
        collapsed: false,
        isolation: node.isolation === 'isolate' ? 'isolate' : 'pass-through',
      } satisfies GroupLayer
    }

    const png = pngOf(node.src)
    if (png?.byteLength) found.push({ layerId: shared.id, mask: false, data: png })
    return { ...shared, kind: 'pixel' } satisfies PixelLayer
  })
}

/**
 * What reopening a `.ora` gives back.
 *
 * Two answers, and which one applies is whether the file has been here before: a container this
 * studio wrote restores its own state exactly, and one from anywhere else is rebuilt from the
 * standard part — with everything the standard cannot say simply absent, rather than the file
 * being refused.
 */
export function canvasFromOra({ stack, surfaces }: OraDocument): {
  state: CanvasState
  pixels: LayerPixels[]
} {
  if (stack.studio) {
    return { state: deserializeCanvas(stack.studio), pixels: pixelsOf(surfaces) }
  }

  const byPath = new Map(surfaces.map(one => [one.path, one.png]))
  const pixels: LayerPixels[] = []
  const layers = layersFromNodes(stack.nodes, src => byPath.get(src), pixels)

  return {
    state: {
      ...deserializeCanvas('{}'),
      width: stack.width,
      height: stack.height,
      layers,
      activeLayerId: layers[layers.length - 1]?.id ?? null,
    },
    pixels,
  }
}

/**
 * The same, from an image document's own `content` — which IS the stack, as JSON.
 *
 * A content that will not parse opens an EMPTY document rather than throwing into a mount effect
 * that has nowhere to show it. The file layer validates this string on every write, so the only
 * way here is a container repaired by hand.
 */
export function canvasFromOraContent(
  content: string,
  surfaces: readonly OraSurface[],
): { state: CanvasState; pixels: LayerPixels[] } {
  return canvasFromOra({ stack: oraStackFromContent(content) ?? EMPTY_STACK, surfaces })
}

/**
 * The stack an image document's `content` IS, or `null` for a string that is not one.
 *
 * The caller decides what an unreadable one means, and the two callers disagree: opening shows an
 * empty document, where baking into an asset must write nothing at all.
 */
export function oraStackFromContent(content: string): OraStack | null {
  try {
    const parsed: unknown = JSON.parse(content)
    return isOraStack(parsed) ? parsed : null
  } catch {
    return null
  }
}

const EMPTY_STACK: OraStack = { width: 0, height: 0, nodes: [], studio: '' }

function isOraStack(value: unknown): value is OraStack {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    Array.isArray(value.nodes) &&
    typeof value.studio === 'string'
  )
}

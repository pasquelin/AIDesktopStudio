import { isGroup, type Layer } from './canvasState'

/**
 * What the engine has to build, as plain data: one node per layer, groups nesting.
 *
 * It answers the questions a stack asks before a single texture is touched — which sprite cuts
 * which, which container holds which group — so they can be tested without a GPU.
 */
export type CompositeNode =
  | {
      kind: 'surface'
      id: string
      /** The layer whose alpha cuts this one out, or `null` when nothing does. */
      clippedBy: string | null
      /** The layer whose mask texture this one carries. Today always itself. */
      maskedBy: string | null
      /** Whether that mask hides anything: unticking the box keeps its pixels on the GPU. */
      maskEnabled: boolean
    }
  | { kind: 'group'; id: string; children: CompositeNode[] }
  /**
   * A grading pass over what it covers. Photoshop's rule: everything below it in its parent, or
   * the single layer below when it is clipped — so `children` is what the filter wraps, not what
   * the layer contains.
   */
  | { kind: 'adjust'; id: string; children: CompositeNode[] }

/**
 * Where a layer's mask lives among the surfaces. One namespace for both, so an undo patch filed
 * under a key finds its way back without knowing which of the two it recorded.
 */
const MASK_SUFFIX = ':mask'

export function maskKey(layerId: string): string {
  return `${layerId}${MASK_SUFFIX}`
}

/** Whether a surface key names a mask rather than a layer's own pixels. */
export function isMaskKey(key: string): boolean {
  return key.endsWith(MASK_SUFFIX)
}

/** Bottom first, like the stack itself: the last node is the one the eye sees on top. */
export function composite(layers: readonly Layer[]): CompositeNode[] {
  let base: string | null = null
  const nodes: CompositeNode[] = []
  for (const layer of layers) {
    if (layer.kind === 'adjustment') {
      const covered = layer.clipped ? nodes.splice(-1) : nodes.splice(0)
      if (covered.length > 0) nodes.push({ kind: 'adjust', id: layer.id, children: covered })
      continue
    }

    if (isGroup(layer)) {
      if (!layer.clipped) base = layer.id
      nodes.push({ kind: 'group', id: layer.id, children: composite(layer.children) })
      continue
    }

    const clippedBy = layer.clipped ? base : null
    if (!layer.clipped) base = layer.id

    nodes.push({
      kind: 'surface',
      id: layer.id,
      clippedBy,
      maskedBy: layer.mask ? layer.id : null,
      maskEnabled: layer.mask?.enabled === true,
    })
  }
  return nodes
}

/**
 * Everything the built tree depends on, as one string. A state that leaves it unchanged — a layer
 * being dragged, a guide being laid — must not cost a rebuild of the whole document.
 */
export function placement(nodes: readonly CompositeNode[]): string {
  return nodes
    .map(node =>
      node.kind === 'surface'
        ? `${node.id}:${node.clippedBy ?? ''}:${node.maskedBy ?? ''}${node.maskEnabled ? '!' : ''}`
        : `${node.id}${node.kind === 'adjust' ? '~' : ''}(${placement(node.children)})`,
    )
    .join(' ')
}

import type { CapabilityTrait } from '@shared/domain/formatCapability'
import {
  IDENTITY,
  allLayers,
  isGroup,
  type CanvasState,
  type Layer,
  type Transform,
} from './canvasState'

/**
 * Whether the transform is no more than the integer offset an open format carries. A moved layer
 * survives a save as OpenRaster; a rotated, scaled or skewed one does not.
 */
function isPlacedOnly(transform: Transform): boolean {
  // `Object.keys` answers `string[]` whatever it is given, and `IDENTITY` holds the whole type.
  const keys = Object.keys(IDENTITY) as (keyof Transform)[]

  return keys.every(key => key === 'x' || key === 'y' || transform[key] === IDENTITY[key])
}

/** What one layer needs a format to carry. A table, so a trait added to the union lands here. */
const HELD_BY_LAYER: readonly [CapabilityTrait, (layer: Layer) => boolean][] = [
  ['groups', isGroup],
  ['layerMask', layer => layer.mask?.enabled === true],
  ['adjustmentLayer', layer => layer.kind === 'adjustment'],
  ['liveText', layer => layer.kind === 'text'],
  ['vectorShape', layer => layer.kind === 'shape'],
  ['layerTransform', layer => !isPlacedOnly(layer.transform)],
  ['blendMode', layer => layer.blend !== 'normal'],
  ['layerOpacity', layer => layer.opacity !== 1 || layer.fillOpacity !== 1],
  ['layerVisibility', layer => !layer.visible],
  ['clipping', layer => layer.clipped],
  ['layerLock', layer => Object.values(layer.locked).some(Boolean)],
]

/**
 * What this document holds that a format has to carry — MEASURED on the state, never declared by
 * the kind. That is what keeps a picture opened, painted on and saved back from asking anything:
 * one plain layer holds nothing, so a flatten risks nothing.
 *
 * A HIDDEN layer holds `layerVisibility`, and that is not a nicety: the stack being one layer,
 * `layers` does not fire, so a document whose only layer is hidden flattened to an empty picture
 * with nothing said. A flat format carries no visibility; the container does.
 */
export function traitsOfCanvas(state: CanvasState): CapabilityTrait[] {
  const layers = allLayers(state.layers)
  const held: CapabilityTrait[] = []

  if (layers.length > 1) held.push('layers')
  if (state.guides.length > 0) held.push('guides')

  return [
    ...held,
    ...HELD_BY_LAYER.filter(([, holds]) => layers.some(holds)).map(([trait]) => trait),
  ]
}

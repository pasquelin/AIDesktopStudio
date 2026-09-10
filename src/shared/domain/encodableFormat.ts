import {
  lossesFor,
  type CapabilityDomain,
  type CapabilityTrait,
  type WritableFormat,
} from './formatCapability'

/**
 * What the studio's writers actually PRODUCE, closest first within each domain.
 *
 * `jpeg` and `webp` are named by the table above and are not here, and the gap is the point: the
 * one picture writer accepts PNG bytes and nothing else, and no export target writes either. A
 * format the table calls writable is not a destination the studio can offer.
 *
 * The order IS the proposal: a document that no longer fits its file is offered the FIRST format
 * of its domain that carries everything it holds — the closest, never the richest. A flat picture
 * whose extension the studio cannot write is offered a PNG, not a container of layers.
 */
const ENCODABLE_BY_DOMAIN: Record<CapabilityDomain, readonly WritableFormat[]> = {
  picture: ['png', 'ora'],
  montage: ['otio'],
  scene: ['obj', 'ply', 'stl', 'gltf'],
  material: ['mtlx'],
  sky: ['gltf'],
}

/**
 * The closest format of this domain that carries every one of these traits.
 *
 * The last of the list when none does, which is the richest the studio writes: something has to
 * be offered, and a caller that must say what is still lost asks `lossesFor` of the answer.
 */
export function nearestEncodableFor(
  domain: CapabilityDomain,
  traits: readonly CapabilityTrait[],
): WritableFormat {
  const offered = ENCODABLE_BY_DOMAIN[domain]
  const fits = offered.find(format => lossesFor(traits, format).length === 0)
  return fits ?? offered[offered.length - 1] ?? 'png'
}

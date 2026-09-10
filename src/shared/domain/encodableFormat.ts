import type { DocumentKind } from './document'
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

/**
 * What « Save as » may offer per kind: the formats the studio writes a DOCUMENT into,
 * and reads back.
 *
 * Not every format it can produce, and the gap is deliberate. A scene exports to OBJ, PLY and STL
 * and opens none of them; offering one here would hand the tab a destination it could not reopen
 * — « a format you write without knowing how to open it is not delivered ». Only the picture has
 * a real choice, its two writers being the flat encoder and the container.
 *
 * Empty for the three kinds with nothing to choose between: an interface is its JSON, a script IS
 * its text, and a character edits the model of the library it was opened on.
 */
const DESTINATIONS_BY_KIND: Record<DocumentKind, readonly WritableFormat[]> = {
  image: ENCODABLE_BY_DOMAIN.picture,
  scene: ['gltf'],
  skybox: ['gltf'],
  sequence: ['otio'],
  audio: ['otio'],
  material: ['mtlx'],
  gui: [],
  script: [],
  character: [],
}

export function destinationFormatsFor(kind: DocumentKind): readonly WritableFormat[] {
  return DESTINATIONS_BY_KIND[kind]
}

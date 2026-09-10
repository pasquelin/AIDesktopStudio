import { extensionOfKind, type DocumentKind } from './document'
import {
  formatOfFile,
  lossesFor,
  type CapabilityDomain,
  type CapabilityTrait,
  type KnownFormat,
} from './formatCapability'

/**
 * What the studio's writers actually PRODUCE, closest first within each domain.
 *
 * `jpeg` and `webp` are named by `KnownFormat` and are not here, and the gap is the point: the
 * one picture writer accepts PNG bytes and nothing else, and no export target writes either. A
 * format the table DESCRIBES is not a destination the studio can offer (E-2).
 *
 * The order IS the proposal: a document that no longer fits its file is offered the FIRST format
 * of its domain that carries everything it holds — the closest, never the richest. A flat picture
 * whose extension the studio cannot write is offered a PNG, not a container of layers.
 */
const ENCODABLE_BY_DOMAIN: Record<CapabilityDomain, readonly KnownFormat[]> = {
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
): KnownFormat {
  const offered = ENCODABLE_BY_DOMAIN[domain]
  const fits = offered.find(format => lossesFor(traits, format).length === 0)
  return fits ?? offered[offered.length - 1] ?? 'png'
}

/**
 * What « Save as » may offer per kind: the formats the studio writes a DOCUMENT into, and reads
 * back.
 *
 * DERIVED from the extension each kind is filed under, never listed a second time: a third
 * per-kind table would be free to disagree with `EXTENSIONS_BY_KIND` the day a kind's extension
 * moves, and the window would then offer a format the tab cannot reopen — the very failure this
 * answer exists to prevent. `.ui.json` and `.ts` name no format of the table, which is the empty
 * list a kind with nothing to choose gets.
 *
 * The picture is the exception and says so: its two writers are the flat encoder and the
 * container, flat first — the closest, never the richest (§5.5).
 */
export function destinationFormatsFor(kind: DocumentKind): readonly KnownFormat[] {
  if (kind === 'image') return ENCODABLE_BY_DOMAIN.picture
  // Asked about a NAME, which is the door the table has: `extensionOf` reads a leading dot as a
  // hidden file, so the kind's extension is hung on a stem to be looked up.
  const written = formatOfFile(`document${extensionOfKind(kind) ?? ''}`)
  return written === null ? [] : [written]
}

import { isRecord } from '../guards'
import { gltfStudioExtras } from './gltf'
import { attribute, unescapeXml } from './xmlText'

/**
 * The files an imported document points at, relative to its own folder.
 *
 * Read off the TEXT rather than off a parsed state: this runs before the file is a document of
 * this studio, on something any application may have written.
 */

/**
 * A document that points at siblings is small; above this it is one that CARRIES them.
 *
 * It also bounds the main process, which is where this parses: 4,1 Mo of glTF took 20,2 ms on
 * this Mac, so the ceiling costs about 40 ms once per imported document.
 */
export const SCANNED_BYTES = 8 * 1024 * 1024

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

function decoded(uri: string): string | null {
  try {
    return decodeURIComponent(uri)
  } catch {
    // A reference nothing can decode names no file, and repairing it would invent one.
    return null
  }
}

/**
 * A reference the studio is willing to follow, or `null`.
 *
 * Refused whole rather than repaired: a scheme — `data:` and `http:` alike — an absolute path, a
 * backslash or a climb above the source folder are each a way of naming a file nobody dropped.
 */
function followable(uri: unknown): string | null {
  if (typeof uri !== 'string' || uri === '' || SCHEME.test(uri)) return null
  const path = decoded(uri)
  if (path === null || path.startsWith('/') || path.includes('\\')) return null

  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return null
    segments.push(segment)
  }
  return segments.length > 0 ? segments.join('/') : null
}

const uris = (value: unknown): unknown[] =>
  Array.isArray(value) ? value.filter(isRecord).map(one => one.uri) : []

/** Where a sky hangs its picture: on the node it turns with, never in `images`. */
const skySources = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value.filter(isRecord).map(node => gltfStudioExtras(node.extras).source)
    : []

function gltfReferences(text: string): unknown[] {
  const parsed: unknown = JSON.parse(text)
  if (!isRecord(parsed)) return []
  return [...uris(parsed.buffers), ...uris(parsed.images), ...skySources(parsed.nodes)]
}

/** Every `filename` input, whatever graph holds it: a foreign material names its nodes as it likes. */
function mtlxReferences(text: string): unknown[] {
  const found: string[] = []
  for (const tag of text.match(/<input\b[^>]*>/g) ?? []) {
    if (attribute(tag, 'type') === 'filename') found.push(unescapeXml(attribute(tag, 'value')))
  }
  return found
}

/** The material libraries a Wavefront OBJ names — `mtllib a.mtl b.mtl`, several to a line. */
function objReferences(text: string): unknown[] {
  const found: string[] = []
  for (const line of text.match(/^\s*mtllib\s+.+$/gm) ?? []) {
    found.push(...line.trim().slice('mtllib'.length).trim().split(/\s+/))
  }
  return found
}

/**
 * The pictures a material library names — `map_Kd`, `bump`, `disp`, `refl`, `norm`…: the file
 * is the LAST word of the line, everything between the keyword and it being options (`-bm 1`).
 */
function mtlReferences(text: string): unknown[] {
  const found: string[] = []
  for (const line of text.match(/^\s*(map_\w+|bump|disp|decal|refl|norm)\s+.+$/gm) ?? []) {
    const words = line.trim().split(/\s+/)
    const last = words[words.length - 1]
    if (last) found.push(last)
  }
  return found
}

/** The pictures a Collada file hangs on its images: `<init_from>` text, or `<ref>` inside it in 1.5. */
function daeReferences(text: string): unknown[] {
  const found: string[] = []
  for (const tag of text.match(/<init_from>[\s\S]*?<\/init_from>/g) ?? []) {
    const inner = tag.replace(/<\/?init_from>/g, '').replace(/<\/?ref>/g, '').trim()
    if (inner) found.push(unescapeXml(inner))
  }
  return found
}

function referencesIn(extension: string, text: string): unknown[] {
  switch (extension) {
    case 'gltf':
      return gltfReferences(text)
    case 'mtlx':
      return mtlxReferences(text)
    case 'obj':
      return objReferences(text)
    case 'mtl':
      return mtlReferences(text)
    case 'dae':
      return daeReferences(text)
    default:
      return []
  }
}

export function documentReferencesOf(extension: string, text: string): readonly string[] {
  if (text.length > SCANNED_BYTES) return []

  try {
    const found = referencesIn(extension, text)
    return [...new Set(found.flatMap(one => followable(one) ?? []))]
  } catch {
    // A file that will not parse points at nothing, and the import refuses it a moment later.
    return []
  }
}

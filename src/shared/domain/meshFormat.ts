/**
 * Which shape format a file is, from its BYTES.
 *
 * Read from the bytes and never from the name, for the reason `loadAnimation` already carries: a
 * model reaches the engine as `ia-studio://asset/<id>`, which spells no extension, and the engine
 * holds no catalogue to ask. A name that IS there still wins where one exists — see `fileRole`.
 */

/**
 * The formats three can parse. `usd` covers the whole family, `.usdz` being the zipped one; `bvh`
 * is the one that never holds a mesh — a skeleton and its motion, and nothing else.
 */
export type MeshFormat = 'gltf' | 'fbx' | 'obj' | 'stl' | 'ply' | 'collada' | 'usd' | 'bvh'

/** How many leading bytes `meshFormatOf` looks at as text. An OBJ may open on a long comment. */
const TEXT_BYTES = 1024

const starts = (bytes: Uint8Array, magic: string): boolean =>
  [...magic].every((letter, at) => bytes[at] === letter.charCodeAt(0))

/**
 * A binary STL carries NO magic — 80 bytes of anything, then a triangle count. The length is the
 * only thing that says so, and it is why this reads the whole file rather than a head: a header
 * beginning with `solid` is common enough that the word alone answers ASCII wrongly.
 */
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false
  const triangles = new DataView(bytes.buffer, bytes.byteOffset, 84).getUint32(80, true)
  return bytes.length === 84 + triangles * 50
}

/** `v`, `vn`, `f`… — a directive at the head of a line, which no other text format here shares. */
const OBJ_DIRECTIVE = /^\s*(v|vn|vt|f|o|g|s|usemtl|mtllib)\s/m

export function meshFormatOf(bytes: Uint8Array): MeshFormat | null {
  if (starts(bytes, 'glTF')) return 'gltf'
  if (starts(bytes, 'Kaydara FBX Binary')) return 'fbx'
  // `ply` then a newline, so a file merely starting with those letters is not one.
  if (starts(bytes, 'ply') && (bytes[3] === 0x0a || bytes[3] === 0x0d)) return 'ply'
  // A `.usdz` is a zip. Crated `.usdc` opens on its own magic; `.usda` is text, below.
  if (starts(bytes, 'PK')) return 'usd'
  if (starts(bytes, 'PXR-USDC')) return 'usd'
  if (isBinaryStl(bytes)) return 'stl'

  const head = new TextDecoder().decode(bytes.subarray(0, TEXT_BYTES))
  const opening = head.trimStart()

  if (opening.startsWith('{')) return 'gltf'
  if (opening.startsWith('#usda')) return 'usd'
  if (opening.startsWith('HIERARCHY')) return 'bvh'
  if (opening.startsWith('solid')) return 'stl'
  // The ASCII spelling of FBX opens on a comment block, and names itself a few lines down.
  if (head.includes('FBXHeaderExtension')) return 'fbx'
  if (opening.startsWith('<')) return head.includes('COLLADA') ? 'collada' : null

  return OBJ_DIRECTIVE.test(head) ? 'obj' : null
}

import { localizedError } from '@shared/localizedError'
import { strFromU8, strToU8, Unzip, UnzipInflate, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  isOraGroup,
  isOraSurfacePath,
  ORA_ENVELOPE_PATH,
  ORA_MERGED_PATH,
  ORA_MIMETYPE,
  ORA_STUDIO_PATH,
  ORA_THUMBNAIL_PATH,
  ORA_VERSION,
  type OraDocument,
  type OraGroup,
  type OraNode,
  type OraNodeBase,
  type OraStack,
  type OraSurface,
} from '@shared/domain/openRaster'
import { attribute, escapeXml, unescapeXml } from '@shared/domain/xmlText'
import { clamp } from '@shared/numeric'

const MIMETYPE_PATH = 'mimetype'
const STACK_PATH = 'stack.xml'

/** The attributes every node writes, whichever kind it is. */
function commonAttributes(node: OraNode): string {
  return (
    `name="${escapeXml(node.name)}" x="${Math.round(node.x)}" y="${Math.round(node.y)}" ` +
    `opacity="${node.opacity}" visibility="${node.visible ? 'visible' : 'hidden'}" ` +
    `composite-op="${escapeXml(node.composite)}"`
  )
}

/**
 * `null` for a layer naming a surface this container does not hold — the one shape of `stack.xml`
 * that makes a reader fail rather than lose a layer.
 *
 * `written` is what the packer ACTUALLY put in, and the two filters had drifted apart: a surface
 * with an illegal path or no bytes is dropped below, while the tree naming it came from elsewhere
 * — a `.ora` written by another application and saved again here. The studio's own state carries
 * the layer either way, `studio` being the whole of it.
 */
function nodeXml(node: OraNode, depth: number, written: ReadonlySet<string>): string | null {
  const pad = '  '.repeat(depth)
  if (!isOraGroup(node)) {
    if (!written.has(node.src)) return null
    return `${pad}<layer ${commonAttributes(node)} src="${escapeXml(node.src)}"/>`
  }

  return [
    `${pad}<stack ${commonAttributes(node)} isolation="${node.isolation}">`,
    ...nodesXml(node.children, depth + 1, written),
    `${pad}</stack>`,
  ].join('\n')
}

const nodesXml = (
  nodes: readonly OraNode[],
  depth: number,
  written: ReadonlySet<string>,
): string[] => nodes.map(node => nodeXml(node, depth, written)).filter(line => line !== null)

function stackXml(stack: OraStack, written: ReadonlySet<string>): string {
  return [
    `<?xml version='1.0' encoding='UTF-8'?>`,
    `<image version="${ORA_VERSION}" w="${stack.width}" h="${stack.height}">`,
    `  <stack>`,
    ...nodesXml(stack.nodes, 2, written),
    `  </stack>`,
    `</image>`,
    '',
  ].join('\n')
}

/**
 * The container, as bytes.
 *
 * `mimetype` goes in FIRST and uncompressed — the one structural rule of the format, and the one
 * whose breach makes the file open nowhere with nothing to say why.
 *
 * `thumbnail` is written as `Thumbnails/thumbnail.png` when one is handed in, and the caller is
 * the one that made it: resizing belongs to a graphics context, and this module stays pure so it
 * can be tested without one. Handed nothing, the entry is LEFT OUT — the flatten used to be
 * written there a second time, which the spec forbids past 256 px and which doubled the size of
 * every file the studio wrote, on disk and again on every read.
 *
 * A surface whose path this file would not have written is DROPPED rather than written where it
 * says: these come across a boundary, and an entry naming its way out of the container would be
 * written back out by whoever unpacks one.
 */
export function packOpenRaster(
  { stack, surfaces }: OraDocument,
  envelope = '',
  thumbnail?: Uint8Array,
): Uint8Array {
  const files: Zippable = {
    [MIMETYPE_PATH]: [strToU8(ORA_MIMETYPE), { level: 0 }],
    // Second, and stored: `oraEnvelopeIn` reads it out of the head of the file alone.
    ...(envelope ? { [ORA_ENVELOPE_PATH]: stored(strToU8(envelope)) } : {}),
  }

  // Before the surfaces, and that ordering is the point: a streaming reader after one tile of a
  // grid finds it in the head of the file, instead of walking every layer to reach the tail.
  if (thumbnail && thumbnail.byteLength > 0) files[ORA_THUMBNAIL_PATH] = stored(thumbnail)

  const written = new Set<string>()
  for (const surface of surfaces) {
    if (!isOraSurfacePath(surface.path) || surface.png.byteLength === 0) continue
    // Refused rather than replaced: an entry is a key of an object, so a second surface of the same
    // path would silently take the first one's pixels away from the layer that named it.
    if (written.has(surface.path)) continue
    written.add(surface.path)
    files[surface.path] = stored(surface.png)
  }

  // After the surfaces, and that ordering is the point: the tree may only name what went in.
  files[STACK_PATH] = strToU8(stackXml(stack, written))

  if (stack.studio) files[ORA_STUDIO_PATH] = strToU8(stack.studio)

  return zipSync(files)
}

/**
 * A PNG goes in UNCOMPRESSED, and that is a performance decision rather than a lazy one.
 *
 * `zipSync` deflates on the thread that owns every window, so a document of several 4K layers
 * would freeze the whole studio for seconds on each ⌘S — invariant 6. A PNG is already deflated
 * inside, so a second pass buys a percent or two for that entire cost. Only `stack.xml` and the
 * studio's state are compressed, and both are text measured in kilobytes.
 */
const stored = (png: Uint8Array): [Uint8Array, { level: 0 }] => [png, { level: 0 }]

/**
 * The spec's own range, and anything else reads as fully opaque — `50%`, an empty attribute, a
 * writer that spelt it `1.0e0` wrongly. Bare, `Number('50%')` is `NaN`, which the studio then wrote
 * back out as `opacity="NaN"`: a layer nothing can draw, in a file no other reader can repair.
 */
function opacityIn(text: string): number {
  // `Number('')` is ZERO, not `NaN`, so the absent attribute is answered before the parse: read
  // through the guard below it would make every layer of a writer that omits opacity invisible.
  if (text === '') return 1
  const value = Number(text)
  return Number.isFinite(value) ? clamp(value, 0, 1) : 1
}

function baseFrom(tag: string): OraNodeBase {
  return {
    name: unescapeXml(attribute(tag, 'name')),
    x: Number(attribute(tag, 'x')) || 0,
    y: Number(attribute(tag, 'y')) || 0,
    opacity: opacityIn(attribute(tag, 'opacity')),
    visible: attribute(tag, 'visibility') !== 'hidden',
    composite: unescapeXml(attribute(tag, 'composite-op')) || 'svg:src-over',
  }
}

/**
 * The stack, walked from the tag stream rather than through a DOM: the main process has no
 * parser, and `stack.xml` is a nesting of two element names with no text content between them.
 */
function readNodes(xml: string): OraNode[] {
  const tags = xml.matchAll(/<(layer|stack)\b([^>]*?)(\/?)>|<\/stack>/g)
  const roots: OraNode[] = []
  // The outermost `<stack>` is the image's own, so children land in `roots` until one nests.
  const open: OraGroup[] = []
  const push = (node: OraNode): void => {
    const parent = open[open.length - 1]
    // `children` is published readonly and filled while the file is walked: the tree is built
    // once here, and nothing outside this function ever holds a node before it is finished.
    if (parent) (parent.children as OraNode[]).push(node)
    else roots.push(node)
  }

  let rootSeen = false

  for (const [tag, kind, , selfClosing] of tags) {
    if (!kind) {
      open.pop()
      continue
    }
    if (kind === 'layer') {
      push({ ...baseFrom(tag), kind: 'layer', src: unescapeXml(attribute(tag, 'src')) })
      continue
    }
    // The FIRST `<stack>` is the image's own and wraps everything: it is not a group. Recognised
    // by position, never by having no name — Krita and the spec's own example write it as
    // `name="root"`, and sniffing for a name imported those files as one group called « root ».
    if (!rootSeen) {
      rootSeen = true
      continue
    }

    const group: OraGroup = {
      ...baseFrom(tag),
      kind: 'group',
      // `isolate` is the DEFAULT the layer-stack spec gives a group, so an absent attribute is
      // an isolated group — read the other way round, a GIMP group that says nothing came back
      // rewritten as `auto`, which is a change to the standard half of someone else's file.
      isolation: attribute(tag, 'isolation') === 'auto' ? 'auto' : 'isolate',
      children: [],
    }
    push(group)
    if (!selfClosing) open.push(group)
  }

  return roots
}

/** What the first kilobytes of a container say about it, without a word of the layers in it. */
export type OraHead = {
  /** `image/openraster` for a container. Anything else is a file that only wears the extension. */
  mimetype: string
  /** The studio's own envelope, or the empty string — every container written elsewhere has none. */
  envelope: string
}

/**
 * The head of a container — its first entries alone, streamed, without the central directory and
 * without inflating a single layer.
 *
 * An empty `mimetype` for bytes that are not a container at all, which is what tells a real
 * `.ora` from a file that only wears the extension. Identified the way the spec says to: the
 * first entry, stored, holding the media type.
 *
 * **The blind spot, in clear**: a container whose writer left `mimetype` out — which the spec
 * forbids and GIMP, Krita and MyPaint all honour — reads here as "not a container", and the
 * document drops out of every listing while sitting in the folder.
 */
export function oraHeadIn(head: Uint8Array): OraHead {
  const found = new Map<string, Uint8Array[]>()
  // The stream hands over what it has, whether or not the entry ENDED inside the buffer — a head
  // cut mid-envelope answers half a JSON object with no error at all, which parses as nothing
  // and would cost the document its identity in silence. Only a finished entry is an answer.
  const whole = new Set<string>()

  const reader = new Unzip(entry => {
    if (entry.name !== ORA_ENVELOPE_PATH && entry.name !== MIMETYPE_PATH) return
    const chunks: Uint8Array[] = []
    found.set(entry.name, chunks)
    entry.ondata = (_error, chunk, final) => {
      chunks.push(chunk)
      if (final) whole.add(entry.name)
    }
    entry.start()
  })
  reader.register(UnzipInflate)

  try {
    // Never final: the buffer STOPS mid-file by design, and saying otherwise asks the reader for
    // a central directory that is megabytes further on.
    reader.push(head, false)
  } catch {
    return { mimetype: '', envelope: '' }
  }

  const textOf = (path: string): string =>
    whole.has(path) ? strFromU8(concatBytes(found.get(path) ?? [])) : ''

  return { mimetype: textOf(MIMETYPE_PATH), envelope: textOf(ORA_ENVELOPE_PATH) }
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const whole = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let at = 0
  for (const chunk of chunks) {
    whole.set(chunk, at)
    at += chunk.byteLength
  }
  return whole
}

/**
 * The flatten alone, read as the file arrives rather than after all of it is in memory.
 *
 * `mergedimage.png` sits near the head of a container the studio wrote, and the streaming reader
 * needs no central directory to find it — so a shelf of layered pictures is drawn without ever
 * holding a whole document. Read whole, one 4K layered picture was hundreds of megabytes in the
 * process that owns every window, once per tile.
 *
 * `null` when the stream ends without it, which is every file that is not a container.
 */
async function mergedPictureIn(
  chunks: AsyncIterable<Uint8Array>,
  wanted: string = ORA_MERGED_PATH,
): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = []
  let complete = false

  const reader = new Unzip(entry => {
    if (entry.name !== wanted) return
    entry.ondata = (_error, chunk, final) => {
      parts.push(chunk)
      if (final) complete = true
    }
    entry.start()
  })
  reader.register(UnzipInflate)

  try {
    for await (const chunk of chunks) {
      reader.push(chunk, false)
      // Everything after it is layers, and inflating those is what this exists to avoid.
      if (complete) break
    }
  } catch {
    return null
  }

  return complete ? concatBytes(parts) : null
}

/**
 * The FLATTEN of a container ON DISK, streamed. What every reader wanting the picture itself
 * takes — the asset scheme, and through it every inspector preview and every layer born of a
 * `.ora`. Answered the thumbnail instead, a 4K picture arrived 256 px wide and was stretched
 * over the whole document.
 */
export function containerPictureOf(file: string): Promise<Uint8Array | null> {
  return pictureIn(file, ORA_MERGED_PATH)
}

/**
 * The same, for a TILE: the container's own thumbnail when it carries one, its flatten otherwise.
 *
 * A choice, never a size — the caller knows it is drawing a tile, and the spec's 256 px cap can
 * only ever be under what a tile asks for. Deciding by the number instead sent the library, which
 * asks for 264, through a whole flatten: 35 MB of RGBA on the process that owns every window, for
 * eight pixels `reduced` cannot even use.
 */
export async function containerTileOf(file: string): Promise<Uint8Array | null> {
  return (await pictureIn(file, ORA_THUMBNAIL_PATH)) ?? (await containerPictureOf(file))
}

/** `null` for every file that is not a container, and for every container without that entry. */
async function pictureIn(file: string, wanted: string): Promise<Uint8Array | null> {
  if (!file.toLowerCase().endsWith('.ora')) return null

  try {
    const { createReadStream } = await import('node:fs')
    return await mergedPictureIn(createReadStream(file), wanted)
  } catch {
    // A file that will not read is answered as every caller answers what it cannot serve.
    return null
  }
}

/**
 * Throws on anything that is not a container — a caller has to tell that from an empty one.
 *
 * Every surface comes back, whether a `<layer>` names it or not: a mask and an adjustment layer's
 * pixels have no element in the standard, and dropping the ones nothing points at would lose
 * exactly what this studio needs to reopen its own work.
 */
export function unpackOpenRaster(bytes: Uint8Array): OraDocument {
  const entries = unzipSync(bytes)
  const xml = entries[STACK_PATH]
  if (!xml) throw localizedError('openRasterStackMissing')

  const image = strFromU8(xml)
  const studio = entries[ORA_STUDIO_PATH]

  const surfaces: OraSurface[] = []
  for (const [path, png] of Object.entries(entries)) {
    if (isOraSurfacePath(path)) surfaces.push({ path, png })
  }

  return {
    stack: {
      width: Number(attribute(image, 'w')) || 0,
      height: Number(attribute(image, 'h')) || 0,
      nodes: readNodes(image),
      studio: studio ? strFromU8(studio) : '',
    },
    surfaces,
  }
}

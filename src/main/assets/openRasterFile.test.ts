import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isOraGroup,
  ORA_MERGED_PATH,
  ORA_MIMETYPE,
  ORA_THUMBNAIL_PATH,
  type OraDocument,
  type OraLayer,
  type OraStack,
  type OraSurface,
} from '@shared/domain/openRaster'
import {
  containerPictureOf,
  containerTileOf,
  oraHeadIn,
  packOpenRaster,
  unpackOpenRaster,
} from './openRasterFile'

const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
)

const layer = (name: string, src: string, over: Partial<OraLayer> = {}): OraLayer => ({
  kind: 'layer',
  name,
  src,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
  composite: 'svg:src-over',
  ...over,
})

const stack = (over: Partial<OraStack> = {}): OraStack => ({
  width: 64,
  height: 32,
  nodes: [layer('Top', 'data/p_a.png'), layer('Bottom', 'data/p_b.png')],
  studio: '{"layers":[]}',
  ...over,
})

const surfaces = (over: readonly OraSurface[] = []): OraSurface[] => [
  { path: ORA_MERGED_PATH, png: PNG },
  { path: 'data/p_a.png', png: PNG },
  { path: 'data/p_b.png', png: PNG },
  ...over,
]

const document = (over: Partial<OraDocument> = {}): OraDocument => ({
  stack: stack(),
  surfaces: surfaces(),
  ...over,
})

const entriesOf = (bytes: Uint8Array): Record<string, string> =>
  Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([name, data]) => [name, strFromU8(data)]),
  )

describe('writing an OpenRaster container', () => {
  it('puts the mimetype first, stored rather than deflated', () => {
    const bytes = packOpenRaster(document())

    // Local file header: compression method at 8, then the name at 30.
    expect([bytes[8], bytes[9]]).toEqual([0, 0])
    expect(strFromU8(bytes.slice(30, 38))).toBe('mimetype')
    expect(entriesOf(bytes).mimetype).toBe(ORA_MIMETYPE)
  })

  it('writes the flattened picture the spec requires', () => {
    const entries = entriesOf(packOpenRaster(document()))

    expect(entries['mergedimage.png']).toBeDefined()
  })

  /**
   * The flatten used to be written a second time under `Thumbnails/`, which the spec forbids
   * past 256 px and which doubled the size of every container — on disk, and again on each read.
   * The entry is optional, so nothing is better than something out of spec.
   */
  it('leaves the thumbnail out rather than writing the flatten twice', () => {
    const entries = entriesOf(packOpenRaster(document()))

    expect(entries['Thumbnails/thumbnail.png']).toBeUndefined()
  })

  it('writes the thumbnail it is handed', () => {
    const entries = entriesOf(packOpenRaster(document(), '', strToU8('tiny')))

    expect(entries['Thumbnails/thumbnail.png']).toBe('tiny')
  })

  it('names each layer in the stack, top first, with the bytes beside it', () => {
    const entries = entriesOf(packOpenRaster(document()))

    expect(entries['stack.xml']).toContain('<image version="0.0.3" w="64" h="32">')
    expect(entries['stack.xml']?.indexOf('Top')).toBeLessThan(
      entries['stack.xml']?.indexOf('Bottom') ?? 0,
    )
    expect(entries['data/p_a.png']).toBeDefined()
    expect(entries['data/p_b.png']).toBeDefined()
  })

  it('nests a group as a stack of its own, which is how the format carries one', () => {
    const written = entriesOf(
      packOpenRaster(
        document({
          stack: stack({
            nodes: [
              {
                kind: 'group',
                name: 'Sky',
                x: 0,
                y: 0,
                opacity: 1,
                visible: true,
                composite: 'svg:src-over',
                isolation: 'isolate',
                children: [layer('Cloud', 'data/p_c.png')],
              },
            ],
          }),
          // The child's own surface: the tree may only name entries the container holds, so a
          // fixture without it was describing a file the packer now refuses to write.
          surfaces: surfaces([{ path: 'data/p_c.png', png: PNG }]),
        }),
      ),
    )['stack.xml']

    expect(written).toContain('<stack name="Sky"')
    expect(written).toContain('isolation="isolate"')
    expect(written).toContain('name="Cloud"')
  })

  it('escapes a layer name that would otherwise break the XML', () => {
    const written = entriesOf(
      packOpenRaster(document({ stack: stack({ nodes: [layer('R&D <draft>', 'data/p_a.png')] }) })),
    )['stack.xml']

    expect(written).toContain('R&amp;D &lt;draft&gt;')
    expect(written).not.toContain('<draft>')
  })
})

describe('writing OpenRaster metadata', () => {
  it('carries the studio state no standard field could hold', () => {
    const entries = entriesOf(
      packOpenRaster(document({ stack: stack({ studio: '{"guides":[1]}' }) })),
    )

    expect(entries['aidesktopstudio/document.json']).toBe('{"guides":[1]}')
  })

  it('writes no studio entry when there is no studio state', () => {
    expect(
      entriesOf(packOpenRaster(document({ stack: stack({ studio: '' }) }))),
    ).not.toHaveProperty('aidesktopstudio/document.json')
  })

  /**
   * These names become ZIP entries the studio writes AND reads back, so one naming its way out
   * of the container would be written back out by whoever unpacks one.
   */
  it('drops a surface whose path it would never have written', () => {
    const entries = entriesOf(
      packOpenRaster(document({ surfaces: surfaces([{ path: '../../escape.png', png: PNG }]) })),
    )

    expect(Object.keys(entries)).not.toContain('../../escape.png')
    expect(entries['data/p_a.png']).toBeDefined()
  })

  /**
   * A `<layer>` naming an entry that is not in the ZIP is the one malformation another reader
   * cannot recover from — the picture is not merely missing, the file is broken.
   *
   * The two filters had drifted apart: the packer drops a surface whose path it would not write,
   * and the tree kept naming it. Unreachable from a capture of this studio, whose stack is built
   * from the surfaces themselves; reachable from a `.ora` written elsewhere and saved again here.
   */
  it('never names a layer whose surface it refused to write', () => {
    const bytes = packOpenRaster({
      stack: stack({
        nodes: [layer('Escaped', '../../escape.png'), layer('Kept', 'data/p_a.png')],
      }),
      surfaces: [
        { path: ORA_MERGED_PATH, png: PNG },
        { path: '../../escape.png', png: PNG },
        { path: 'data/p_a.png', png: PNG },
      ],
    })

    expect(entriesOf(bytes)['stack.xml']).not.toContain('escape.png')
    expect(entriesOf(bytes)['stack.xml']).toContain('data/p_a.png')
  })

  /**
   * An entry is a key of an object, so the second surface of a path simply replaced the first —
   * and the layer that named it drew the other one's pixels, with nothing to say so.
   */
  it('keeps the first surface of a path rather than letting a second take its place', () => {
    const second = Uint8Array.from(Buffer.from('iVBORw0KGgo=', 'base64'))
    const entries = entriesOf(
      packOpenRaster({
        stack: stack({ nodes: [layer('One', 'data/p_a.png')] }),
        surfaces: [
          { path: ORA_MERGED_PATH, png: PNG },
          { path: 'data/p_a.png', png: PNG },
          { path: 'data/p_a.png', png: second },
        ],
      }),
    )

    expect(entries['data/p_a.png']).toBe(strFromU8(PNG))
  })

  /**
   * The head of the file alone — a container of ten 4K layers is a hundred megabytes, and a
   * listing reads one per document.
   */
  it('puts the studio envelope where the first kilobytes of the file reach it', () => {
    const envelope = '{"version":3,"kind":"image","title":"Planche","updatedAt":"x","id":"doc-1"}'
    const bytes = packOpenRaster(document(), envelope)

    expect(oraHeadIn(bytes.subarray(0, 64 * 1024))).toEqual({
      mimetype: ORA_MIMETYPE,
      envelope,
    })
  })

  /**
   * A head cut mid-envelope hands back half a JSON object with no error at all, which would cost
   * the document its identity in silence. Only a FINISHED entry is an answer.
   */
  it('answers nothing rather than half an envelope when the head stops short', () => {
    const bytes = packOpenRaster(document(), '{"version":3,"kind":"image","id":"doc-1"}')

    expect(oraHeadIn(bytes.subarray(0, 80)).envelope).toBe('')
  })

  it('answers no envelope for a container that carries none of ours', () => {
    expect(oraHeadIn(packOpenRaster(document()))).toEqual({
      mimetype: ORA_MIMETYPE,
      envelope: '',
    })
  })

  /**
   * What tells a real container from a file that only wears the extension. Without it a `.ora`
   * the user copied a scene into is listed as an image document, opens as nothing, and is
   * overwritten by the next ⌘S.
   */
  it('answers no mimetype for bytes that are not a container', () => {
    expect(oraHeadIn(strToU8('a scene, saved under the wrong name')).mimetype).toBe('')
  })
})

describe('reading an OpenRaster container back', () => {
  it('gives back the stack it was handed', () => {
    const written = document()

    expect(unpackOpenRaster(packOpenRaster(written))).toEqual(written)
  })

  it('gives back a nested group with its children', () => {
    const written = document({
      stack: stack({
        nodes: [
          {
            kind: 'group',
            name: 'Sky',
            x: 4,
            y: 8,
            opacity: 0.5,
            visible: false,
            composite: 'svg:multiply',
            isolation: 'isolate',
            children: [layer('Cloud', 'data/p_c.png', { x: 2, y: 3, opacity: 0.25 })],
          },
        ],
      }),
      surfaces: [
        { path: ORA_MERGED_PATH, png: PNG },
        { path: 'data/p_c.png', png: PNG },
      ],
    })

    expect(unpackOpenRaster(packOpenRaster(written))).toEqual(written)
  })

  /**
   * The case the whole feature is about: a `.ora` another editor wrote holds no studio entry, and
   * opening it must give back what it DOES hold rather than refusing.
   */
  it('reads a container written without any studio state', () => {
    const read = unpackOpenRaster(packOpenRaster(document({ stack: stack({ studio: '' }) })))

    expect(read.stack.studio).toBe('')
    expect(read.stack.nodes).toHaveLength(2)
  })

  /**
   * A mask has no element in the standard, so no `<layer>` names its file — and it still has to
   * come back. Another application ignores the entry; this one is the only reader that wants it.
   */
  it('carries back the pixels no layer element names', () => {
    const written = document({ surfaces: surfaces([{ path: 'data/m_a.png', png: PNG }]) })

    expect(unpackOpenRaster(packOpenRaster(written)).surfaces).toContainEqual({
      path: 'data/m_a.png',
      png: PNG,
    })
  })
})

const foreign = (stack: string): Uint8Array =>
  zipSync({
    mimetype: [strToU8(ORA_MIMETYPE), { level: 0 }],
    'stack.xml': strToU8(stack),
    'mergedimage.png': strToU8('x'),
    'data/ink.png': strToU8('x'),
  })

describe('reading foreign OpenRaster containers', () => {
  it('reads an attribute whose name ends another one, whatever the order', () => {
    const read = unpackOpenRaster(
      foreign(
        `<image version="0.0.3" w="64" h="32"><stack>` +
          `<layer composite-op="svg:src-over" name="Ink" opacity="0.25" src="data/ink.png" ` +
          `visibility="visible" x="7" y="9"/>` +
          `</stack></image>`,
      ),
    )

    expect(read.stack.nodes[0]).toMatchObject({ name: 'Ink', x: 7, y: 9, opacity: 0.25 })
  })

  /**
   * An opacity nothing can read is fully opaque, never `NaN` — the layer would be undrawable, and
   * the studio wrote the word back out on the next ⌘S, leaving a file no other reader can repair.
   * `x` and `y` had this defence from the start (`|| 0`); opacity did not, and it is the attribute
   * a writer is most likely to spell its own way.
   */
  it.each([
    ['50%', 1],
    ['', 1],
    ['1.5', 1],
    ['-2', 0],
  ])('reads an opacity of %s as %s rather than as a number nothing can draw', (written, read) => {
    const stack = unpackOpenRaster(
      foreign(
        `<image version="0.0.3" w="64" h="32"><stack>` +
          `<layer src="data/ink.png" name="Ink" x="0" y="0" opacity="${written}" ` +
          `visibility="visible" composite-op="svg:src-over"/>` +
          `</stack></image>`,
      ),
    ).stack

    expect(stack.nodes[0]).toMatchObject({ opacity: read })
  })

  /**
   * The stack GIMP 3.2.4 really writes, copied verbatim off a file it exported on 18/08 — the
   * only case here that is not this repository guessing at another application. It carries
   * `selected`, which the spec does not define, and no `version` on `<image>`.
   *
   * The other half of that measurement cannot live in this suite: GIMP opened a container
   * `packOpenRaster` wrote and reported both layer names, `0.25` opacity and the multiply mode.
   * It needs GIMP installed, so it is written in `.claude/etat-formats-ouverts.md` instead.
   */
  it('reads the stack an installed GIMP actually wrote', () => {
    const read = unpackOpenRaster(
      foreign(
        `<image w="64" h="32"><stack>` +
          `<layer src="data/000.png" name="Encre GIMP" x="0" y="0" opacity="0.4" ` +
          `visibility="visible" composite-op="svg:multiply" selected="true" />` +
          `<layer src="data/001.png" name="Fond GIMP" x="0" y="0" opacity="1.0" ` +
          `visibility="visible" composite-op="svg:src-over" />` +
          `</stack></image>`,
      ),
    )

    expect(read.stack).toMatchObject({
      width: 64,
      height: 32,
      nodes: [
        { kind: 'layer', name: 'Encre GIMP', opacity: 0.4, composite: 'svg:multiply' },
        { kind: 'layer', name: 'Fond GIMP', opacity: 1, composite: 'svg:src-over' },
      ],
      studio: '',
    })
  })

  /**
   * A GROUP as GIMP 3.2.4 really writes one, copied verbatim off a file it exported on 18/08.
   * It carries neither `x`/`y` nor `isolation`, both of which this studio always emits — so the
   * defaults are the whole of what is on trial here, and `groups` is declared interchange.
   */
  it('reads a group an installed GIMP actually wrote, defaults and all', () => {
    const read = unpackOpenRaster(
      foreign(
        `<image w="64" h="32"><stack>` +
          `<stack name="Groupe GIMP" opacity="0.6" visibility="visible" ` +
          `composite-op="svg:src-over">` +
          `<layer src="data/001-000.png" name="Dans le groupe" x="0" y="0" opacity="1.0" ` +
          `visibility="visible" composite-op="svg:src-over" selected="true" />` +
          `</stack>` +
          `<layer src="data/001.png" name="Hors groupe" x="0" y="0" opacity="1.0" ` +
          `visibility="visible" composite-op="svg:src-over" />` +
          `</stack></image>`,
      ),
    )

    const group = read.stack.nodes[0]
    expect(read.stack.nodes).toHaveLength(2)
    expect(group).toMatchObject({ kind: 'group', name: 'Groupe GIMP', opacity: 0.6, x: 0, y: 0 })
    expect(group && isOraGroup(group) ? group.children.map(child => child.name) : []).toEqual([
      'Dans le groupe',
    ])
    expect(read.stack.nodes[1]).toMatchObject({ kind: 'layer', name: 'Hors groupe' })
  })

  /**
   * Krita — and the spec's own example — name the image's root stack `root`. Recognising it by
   * « has no name » imported such a file as ONE group wrapping the whole document.
   */
  it('takes the root stack for the image itself, even when it is named', () => {
    const read = unpackOpenRaster(
      foreign(
        `<image version="0.0.3" w="64" h="32">` +
          `<stack name="root" opacity="1" visibility="visible" composite-op="svg:src-over">` +
          `<layer name="Ink" src="data/ink.png" x="0" y="0" opacity="1" visibility="visible" ` +
          `composite-op="svg:src-over"/>` +
          `</stack></image>`,
      ),
    )

    expect(read.stack.nodes).toHaveLength(1)
    expect(read.stack.nodes[0]).toMatchObject({ kind: 'layer', name: 'Ink' })
  })

  it('refuses bytes that are not an OpenRaster container', () => {
    expect(() => unpackOpenRaster(packOpenRaster(document()).slice(0, 20))).toThrow()
  })
})

describe('containerPictureOf', () => {
  const FLATTEN = strToU8('the whole picture')
  const THUMB = strToU8('the small one')

  let folder = ''

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'ora-picture-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  const written = async (entries: Record<string, Uint8Array>): Promise<string> => {
    const file = join(folder, 'picture.ora')
    await writeFile(file, zipSync({ mimetype: [strToU8(ORA_MIMETYPE), { level: 0 }], ...entries }))
    return file
  }

  /**
   * The asset scheme routes every `ai-desktop-studio://asset/…` through this, so a layer sourced from a
   * container reads it too: answered the thumbnail, a 4K picture arrived 256 px wide and was
   * stretched over the whole document.
   */
  it('gives the flatten to a caller that names no size', async () => {
    const file = await written({ [ORA_MERGED_PATH]: FLATTEN, [ORA_THUMBNAIL_PATH]: THUMB })

    await expect(containerPictureOf(file)).resolves.toEqual(FLATTEN)
  })

  it('gives a tile the thumbnail, which weighs kilobytes', async () => {
    const file = await written({ [ORA_MERGED_PATH]: FLATTEN, [ORA_THUMBNAIL_PATH]: THUMB })

    await expect(containerTileOf(file)).resolves.toEqual(THUMB)
  })

  it('falls back to the flatten when the container carries no thumbnail', async () => {
    const file = await written({ [ORA_MERGED_PATH]: FLATTEN })

    await expect(containerTileOf(file)).resolves.toEqual(FLATTEN)
  })
})

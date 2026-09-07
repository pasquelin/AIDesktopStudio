import { describe, expect, it } from 'vitest'
import {
  MTLX_BASE_COLOR,
  MTLX_DISPLACEMENT,
  MTLX_NORMAL,
  MTLX_ROUGHNESS,
  MTLX_SRGB,
  type MtlxDocument,
} from '@shared/domain/materialX'
import { mtlxHeadIn, readMaterialX, writeMaterialX } from './materialXFile'

/**
 * `standard_surface_brass_tiled.mtlx`, copied VERBATIM from the MaterialX 1.39 distribution
 * (`resources/Materials/Examples/StandardSurface/`).
 *
 * Inlined rather than read off a clone: it is the one file here that nobody wrote, and a test
 * that fetches it measures nothing on a machine that has no network.
 */
const BRASS = `<?xml version="1.0"?>
<materialx version="1.39" colorspace="lin_rec709" fileprefix="../../../Images/">
  <nodegraph name="NG_brass1">
    <tiledimage name="image_color" type="color3">
      <input name="file" type="filename" value="brass_color.jpg" colorspace="srgb_texture" />
      <input name="uvtiling" type="vector2" value="1.0, 1.0" />
    </tiledimage>
    <tiledimage name="image_roughness" type="float">
      <input name="file" type="filename" value="brass_roughness.jpg" />
      <input name="uvtiling" type="vector2" value="1.0, 1.0" />
    </tiledimage>
    <output name="out_color" type="color3" nodename="image_color" />
    <output name="out_roughness" type="float" nodename="image_roughness" />
  </nodegraph>
  <standard_surface name="SR_brass1" type="surfaceshader">
    <input name="base" type="float" value="1" />
    <input name="base_color" type="color3" value="1, 1, 1" />
    <input name="specular" type="float" value="0" />
    <input name="specular_roughness" type="float" nodegraph="NG_brass1" output="out_roughness" />
    <input name="metalness" type="float" value="1" />
    <input name="coat" type="float" value="1" />
    <input name="coat_color" type="color3" nodegraph="NG_brass1" output="out_color" />
    <input name="coat_roughness" type="float" nodegraph="NG_brass1" output="out_roughness" />
  </standard_surface>
  <surfacematerial name="Tiled_Brass" type="material">
    <input name="surfaceshader" type="surfaceshader" nodename="SR_brass1" />
  </surfacematerial>
</materialx>
`

const document = (over: Partial<MtlxDocument> = {}): MtlxDocument => ({
  images: [
    {
      input: MTLX_BASE_COLOR,
      type: 'color3',
      file: 'Assets/base.png',
      colorspace: MTLX_SRGB,
      tiling: [2, 3],
      offset: [0.25, 0.5],
    },
  ],
  values: [{ input: MTLX_ROUGHNESS, type: 'float', value: 0.4 }],
  ...over,
})

describe('a material written as MaterialX', () => {
  it('opens on the declaration and the version the specification names', () => {
    const written = writeMaterialX(document())

    expect(written.startsWith('<?xml version="1.0"?>\n<materialx version="1.39"')).toBe(true)
  })

  /**
   * The identity has to be reachable in a bounded head read, and the state is what weighs — a
   * material of eight channels carries every dial the standard cannot say. Written the other way
   * round, a large enough state pushes the identity past the head and the document stops listing.
   */
  it('writes the envelope before the state, where a head read reaches it', () => {
    const written = writeMaterialX(document({ studio: { channels: {} } }), '{"documentId":"m1"}')

    expect(written.indexOf('aidesktopstudiodocument=')).toBeLessThan(
      written.indexOf('aidesktopstudiostate='),
    )
    expect(mtlxHeadIn(written)).toEqual({ version: '1.39', envelope: '{"documentId":"m1"}' })
  })

  /**
   * The shape a NEW material has, and the one the app writes first — seen on screen before it was
   * written here. An empty `<nodegraph>` is noise every other reader steps over.
   */
  it('writes no graph at all when no channel carries a picture', () => {
    const written = writeMaterialX(document({ images: [] }))

    expect(written).not.toContain('<nodegraph')
    expect(written).toContain('<standard_surface name="SR_aidesktopstudio" type="surfaceshader">')
    expect(readMaterialX(written).images).toEqual([])
  })

  /**
   * The claim above, actually held. Both attributes ride in the SAME tag, so a reader that waits
   * for the closing `>` fails its match entirely once the state is heavy — and `readHead` then
   * throws « Not a MaterialX document », taking the file out of every listing while it sits on
   * disk. The ordering only pays if each attribute is read where it sits.
   */
  it('reaches the envelope even when the state pushes the tag past the head limit', () => {
    const heavy = writeMaterialX(
      document({ studio: { note: 'x'.repeat(40_000) } }),
      '{"documentId":"m1"}',
    )

    // The ROOT tag's own bracket, not the one closing the XML declaration in front of it.
    expect(heavy.indexOf('>', heavy.indexOf('<materialx'))).toBeGreaterThan(16 * 1024)
    expect(mtlxHeadIn(heavy)).toEqual({ version: '1.39', envelope: '{"documentId":"m1"}' })
  })

  it('answers no version for a file that only wears the extension', () => {
    expect(mtlxHeadIn('<html><body>not a material</body></html>')).toEqual({
      version: '',
      envelope: '',
    })
  })

  it('reads back the images, the values and the state it wrote', () => {
    const held = document({ studio: { material: { color: '#ff0000' } } })

    expect(readMaterialX(writeMaterialX(held, '{}'))).toEqual(held)
  })

  /** A tint is a `<multiply>` between the image and the colour, which the standard part carries. */
  it('reads back a base colour the material tints', () => {
    const held = document({
      images: [
        {
          input: MTLX_BASE_COLOR,
          type: 'color3',
          file: 'Assets/base.png',
          tiling: [1, 1],
          offset: [0, 0],
          multiply: [1, 0.5, 0],
        },
      ],
    })

    expect(readMaterialX(writeMaterialX(held)).images[0]?.multiply).toEqual([1, 0.5, 0])
  })

  /** The normal map passes through `<normalmap>`, whose `scale` is the studio's own dial. */
  it('reads back a normal map through its wrapper', () => {
    const held = document({
      images: [
        {
          input: MTLX_NORMAL,
          type: 'vector3',
          file: 'Assets/normal.png',
          tiling: [1, 1],
          offset: [0, 0],
          wrap: { node: 'normalmap', scale: 0.75 },
        },
      ],
    })

    expect(readMaterialX(writeMaterialX(held)).images[0]).toMatchObject({
      input: MTLX_NORMAL,
      wrap: { node: 'normalmap', scale: 0.75 },
    })
  })

  /**
   * Height is the one channel that does NOT land on the surface shader: `<displacement>` yields a
   * `displacementshader`, which the specification hangs off `surfacematerial` and not off
   * `standard_surface`. Writing it as a surface input would be a file no reader could resolve.
   */
  it('hangs the height map off the material as a displacement shader', () => {
    const held = document({
      images: [
        {
          input: MTLX_DISPLACEMENT,
          type: 'float',
          file: 'Assets/height.png',
          tiling: [1, 1],
          offset: [0, 0],
          wrap: { node: 'displacement', scale: 0.2 },
        },
      ],
    })
    const written = writeMaterialX(held)

    expect(written).toContain('<displacement name="DS_aidesktopstudio" type="displacementshader">')
    expect(written).toContain('<input name="displacementshader" type="displacementshader"')
    expect(readMaterialX(written).images[0]).toMatchObject({
      input: MTLX_DISPLACEMENT,
      wrap: { node: 'displacement', scale: 0.2 },
    })
  })

  /**
   * The closest thing to a reader this machine has. No MaterialX implementation is installed here
   * and none will be, so what can be checked is what a reader would RESOLVE: every `nodename` has
   * to name a declared element, and every `nodegraph`/`output` pair an output that graph declares.
   * A dangling reference is the one way to write a well-formed file no renderer can load.
   */
  it('leaves no reference a reader could not resolve', () => {
    const written = writeMaterialX(
      document({
        images: [
          {
            input: MTLX_BASE_COLOR,
            type: 'color3',
            file: 'Assets/base.png',
            tiling: [1, 1],
            offset: [0, 0],
            multiply: [1, 0.5, 0],
          },
          {
            input: MTLX_NORMAL,
            type: 'vector3',
            file: 'Assets/normal.png',
            tiling: [1, 1],
            offset: [0, 0],
            wrap: { node: 'normalmap', scale: 1 },
          },
          {
            input: MTLX_DISPLACEMENT,
            type: 'float',
            file: 'Assets/height.png',
            tiling: [1, 1],
            offset: [0, 0],
            wrap: { node: 'displacement', scale: 0.2 },
          },
        ],
      }),
    )

    const declared = new Set([...written.matchAll(/<\w+\s[^>]*?name="([^"]*)"/g)].map(m => m[1]))
    const referenced = [...written.matchAll(/nodename="([^"]*)"/g)].map(m => m[1])
    expect(referenced.filter(name => !declared.has(name))).toEqual([])

    const outputs = [...written.matchAll(/nodegraph="([^"]*)"\s+output="([^"]*)"/g)]
    expect(outputs.length).toBeGreaterThan(0)
    expect(outputs.filter(([, , output]) => !written.includes(`<output name="${output}"`))).toEqual(
      [],
    )
  })

  it('escapes a path the XML would otherwise take for markup', () => {
    const written = writeMaterialX(
      document({
        images: [
          {
            input: MTLX_BASE_COLOR,
            type: 'color3',
            file: 'Assets/rouge & <or>.png',
            tiling: [1, 1],
            offset: [0, 0],
          },
        ],
      }),
    )

    expect(written).toContain('value="Assets/rouge &amp; &lt;or&gt;.png"')
    expect(readMaterialX(written).images[0]?.file).toBe('Assets/rouge & <or>.png')
  })
})

/**
 * The file the distribution ships, read as a material from elsewhere: it carries no attribute of
 * ours, so everything comes from the standard part alone — which is the whole point of the format
 * being the document.
 */
describe('a MaterialX file this studio did not write', () => {
  it('carries no studio state', () => {
    expect(readMaterialX(BRASS).studio).toBeUndefined()
  })

  /**
   * `fileprefix` is prepended to every `filename` value in its scope — § File Prefixes. BRASS
   * carries one, and ignoring it hands the window a path that names no picture at all: the
   * catalogue resolves nothing, and a save writes the material with its textures unlinked.
   */
  it('rebuilds each textured input from the graph behind it, through the file prefix', () => {
    const read = readMaterialX(BRASS)

    expect(read.images).toContainEqual({
      input: 'coat_color',
      type: 'color3',
      file: '../../../Images/brass_color.jpg',
      colorspace: 'srgb_texture',
      tiling: [1, 1],
      offset: [0, 0],
    })
    expect(
      read.images
        .filter(image => image.file === '../../../Images/brass_roughness.jpg')
        .map(i => i.input),
    ).toEqual(['specular_roughness', 'coat_roughness'])
  })

  /**
   * This studio rewrites a `.mtlx` from ONE material and from six surface inputs. A file holding
   * more has to be REPORTED, or the next save comes back with the rest of it deleted — and the
   * file is the only copy.
   *
   * **The INPUT grain is the one that matters, and it was the hole**: `standard_surface` is an
   * element this studio composes, so an element-only check read this very file as safe to
   * rewrite while a save would have dropped its `coat`, `specular` and `base`.
   */
  it('reports the surface inputs it would not write back', () => {
    expect(readMaterialX(BRASS).extra).toEqual([
      'input:base',
      'input:specular',
      'input:coat',
      'input:coat_color',
      'input:coat_roughness',
    ])
  })

  it('reports an element it does not compose', () => {
    const withLook = BRASS.replace(
      '</materialx>',
      '  <look name="L"><materialassign material="Tiled_Brass" /></look>\n</materialx>',
    )

    expect(readMaterialX(withLook).extra).toContain('look')
    expect(readMaterialX(withLook).extra).toContain('materialassign')
  })

  it('reports a second material as more than it composes', () => {
    const twice = BRASS.replace(
      '</materialx>',
      '  <surfacematerial name="Other" type="material">\n' +
        '    <input name="surfaceshader" type="surfaceshader" nodename="SR_brass1" />\n' +
        '  </surfacematerial>\n</materialx>',
    )

    expect(readMaterialX(twice).extra).toContain('surfacematerial')
  })

  /** A file of OURS carries only what we compose, so nothing is ever reported for it. */
  it('reports nothing for a file this studio wrote', () => {
    expect(readMaterialX(writeMaterialX(document({ studio: {} }), '{}')).extra).toBeUndefined()
  })

  /**
   * The DECLARED type, never one re-derived from how many numbers a value holds. `normal` and
   * `tangent` are `vector3` in `standard_surface`; counting their three numbers calls them
   * `color3`, and a rename — which reads then rewrites the body — would write that wrong type out.
   */
  it('keeps the type a value was declared with, rather than counting its numbers', () => {
    const withVector = BRASS.replace(
      '<input name="base" type="float" value="1" />',
      '<input name="tangent" type="vector3" value="1, 0, 0" />',
    )

    expect(readMaterialX(withVector).values).toContainEqual({
      input: 'tangent',
      type: 'vector3',
      value: [1, 0, 0],
    })
  })

  /** A value holding no number at all was dropped entirely by a numeric parse. */
  it('carries a value that is not a number across untouched', () => {
    const withFlag = BRASS.replace(
      '<input name="base" type="float" value="1" />',
      '<input name="thin_walled" type="boolean" value="true" />',
    )
    const read = readMaterialX(withFlag)

    expect(read.values).toContainEqual({ input: 'thin_walled', type: 'boolean', value: 'true' })
    expect(writeMaterialX(read)).toContain('<input name="thin_walled" type="boolean" value="true"')
  })

  it('reads the uniform inputs beside them', () => {
    const read = readMaterialX(BRASS)

    expect(read.values).toContainEqual({ input: 'metalness', type: 'float', value: 1 })
    expect(read.values).toContainEqual({ input: 'base_color', type: 'color3', value: [1, 1, 1] })
  })
})

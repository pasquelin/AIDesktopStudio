import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { bodyFormatOf, ENVELOPED } from './documentBody'

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

/** What a format wrote, as text — every format but OpenRaster writes a string. */
const asText = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : Buffer.from(body).toString('utf8')

describe('a material held as MaterialX', () => {
  const material = bodyFormatOf('.mtlx')

  const materialDocument = (over: Partial<DocumentFile> = {}): DocumentFile => ({
    version: DOCUMENT_VERSION,
    kind: 'material',
    title: 'Laiton',
    updatedAt: '2026-08-18T10:00:00.000Z',
    id: 'doc-mat',
    content: JSON.stringify({
      images: [
        {
          input: 'base_color',
          type: 'color3',
          file: 'Assets/base.png',
          colorspace: 'srgb_texture',
          tiling: [1, 1],
          offset: [0, 0],
        },
      ],
      values: [{ input: 'specular_roughness', type: 'float', value: 0.5 }],
      studio: { material: { edgeIntensity: 0.4 } },
    }),
    ...over,
  })

  it('writes real MaterialX a reader that knows nothing of the studio can parse', () => {
    const written = asText(material.write(materialDocument()))

    expect(written.startsWith('<?xml version="1.0"?>\n<materialx version="1.39"')).toBe(true)
    expect(written).toContain('<standard_surface name="SR_aidesktopstudio" type="surfaceshader">')
    expect(written).toContain('<surfacematerial name="aidesktopstudio_material" type="material">')
  })

  /**
   * Kind and id come back; title and clock come back EMPTY, exactly as a glTF's do — `foundAt`
   * fills them from the file's own name and the disk's own time.
   */
  it('reads back the kind and the id it wrote', () => {
    const read = material.read(onDisk(asText(material.write(materialDocument()))))

    expect(read).toMatchObject({ kind: 'material', id: 'doc-mat', title: '', updatedAt: '' })
  })

  /** The content is the composed structure and never the file's own text, as a picture's is. */
  it('reads the content back as the structure the editor composed', () => {
    const read = material.read(onDisk(asText(material.write(materialDocument()))))

    expect(JSON.parse(read.content)).toMatchObject({
      images: [{ input: 'base_color', file: 'Assets/base.png' }],
      values: [{ input: 'specular_roughness', value: 0.5 }],
      studio: { material: { edgeIntensity: 0.4 } },
    })
  })

  /**
   * A `.mtlx` written before the switch holds an envelope on a first line of ours. Refusing it
   * would drop every material a project already has out of every listing.
   */
  it('still reads a material written the studio own way', () => {
    const enveloped = ENVELOPED.write(materialDocument({ content: '{"channels":{}}' }))

    expect(material.read(onDisk(asText(enveloped)))).toMatchObject({
      kind: 'material',
      id: 'doc-mat',
      title: 'Laiton',
    })
  })

  // A `.mtlx` from anywhere else claims no kind, and takes the one its extension names.
  it('reads a MaterialX that carries no attribute of ours as a texture', () => {
    const read = material.read(
      onDisk('<?xml version="1.0"?>\n<materialx version="1.39">\n</materialx>\n'),
    )

    expect(read).toMatchObject({ kind: 'material', title: '' })
    expect(read.id).toBeUndefined()
  })
})

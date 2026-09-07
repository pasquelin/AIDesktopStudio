import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { ORA_MERGED_PATH } from '@shared/domain/openRaster'

import { packOpenRaster } from '@main/assets/openRasterFile'

import { bodyFormatOf } from './documentBody'

/** One transparent pixel, which is all any of this needs to be real PNG bytes. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  ),
)

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

describe('a layered picture held as OpenRaster', () => {
  const ora = bodyFormatOf('.ora')

  const document = (over: Partial<DocumentFile> = {}): DocumentFile => ({
    version: DOCUMENT_VERSION,
    kind: 'image',
    title: 'Planche',
    updatedAt: '2026-08-18T10:00:00.000Z',
    id: 'doc-1',
    content: JSON.stringify({
      width: 64,
      height: 32,
      nodes: [
        {
          kind: 'layer',
          name: 'Encre',
          src: 'data/p_a.png',
          x: 0,
          y: 0,
          opacity: 1,
          visible: true,
          composite: 'svg:src-over',
        },
      ],
      studio: '{"layers":[]}',
    }),
    parts: [
      { path: ORA_MERGED_PATH, png: PNG },
      { path: 'data/p_a.png', png: PNG },
    ],
    ...over,
  })

  it('reads back the stack, the surfaces and the envelope it wrote', () => {
    const written = document()
    const read = ora.read(onDisk(ora.write(written)))

    // The stack goes out as `stack.xml` and comes back parsed, so the JSON is re-spelt: what
    // has to survive is what it MEANS, and comparing the strings would only test key order.
    expect({ ...read, content: JSON.parse(read.content) }).toEqual({
      ...written,
      content: JSON.parse(written.content),
    })
  })

  /** Written whole at every ⌘S, so a stack that lost its surfaces is a picture that lost itself. */
  it('keeps every surface through a write and a read', () => {
    const read = ora.read(onDisk(ora.write(document())))

    expect(read.parts?.map(one => one.path).sort()).toEqual(
      [ORA_MERGED_PATH, 'data/p_a.png'].sort(),
    )
  })

  // A picture GIMP wrote carries no envelope of ours: it is a document all the same, known by
  // its file name exactly as one written before version 3 is.
  it('reads a container that carries no envelope of ours', () => {
    const foreign = packOpenRaster({
      stack: { width: 8, height: 8, nodes: [], studio: '' },
      surfaces: [{ path: ORA_MERGED_PATH, png: PNG }],
    })

    const read = ora.read(Buffer.from(foreign))
    expect(read).toMatchObject({ kind: 'image', title: '' })
    expect(read.id).toBeUndefined()
  })

  it('refuses bytes that are not a container', () => {
    expect(() => ora.read(onDisk('not a zip at all'))).toThrow()
  })
})

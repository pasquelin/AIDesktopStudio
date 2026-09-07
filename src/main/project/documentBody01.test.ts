import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { bodyFormatOf, ENVELOPED } from './documentBody'

const scene = bodyFormatOf('.gltf')

/** What `readFile` hands a format: a format reads bytes, whatever the shape of what it wrote. */
const onDisk = (body: string | Uint8Array): Buffer => Buffer.from(body)

describe('a document of the studio’s own spelling', () => {
  it('reads back the envelope and the content it wrote', () => {
    const document: DocumentFile = {
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Level',
      updatedAt: '2026-08-18T10:00:00.000Z',
      id: 'doc-1',
      content: '{"nodes":[]}',
    }

    expect(scene.read(onDisk(scene.write(document)))).toEqual(document)
  })

  // Anything the table does not name is the studio's own, which is what keeps a manifest and a
  // kind that does not exist yet reading the same way.
  it('is what an unlisted extension is spelt in', () => {
    expect(bodyFormatOf('.whatever')).toBe(ENVELOPED)
  })
})

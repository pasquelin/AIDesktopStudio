import { describe, expect, it } from 'vitest'

import { DOCUMENT_VERSION, type DocumentFile } from '@shared/domain/document'

import { bodyFormatOf } from './documentBody'

const scene = bodyFormatOf('.gltf')

/** What a format wrote, as text — every format but OpenRaster writes a string. */
const asText = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : Buffer.from(body).toString('utf8')

const writeScene = (document: DocumentFile): string => asText(scene.write(document))

describe('a scene held as glTF', () => {
  // Everything of ours lives under one key, and the extras a file arrived with are somebody
  // else's — a reordering that dropped them would be a reordering that loses data.
  it('keeps the extras the file arrived with beside the studio’s own', () => {
    const foreign = JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [], extras: { blender: { flavour: 'cycles' } } }],
      nodes: [],
    })

    const written = writeScene({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: '',
      updatedAt: '',
      content: foreign,
    })

    expect(JSON.parse(written).scenes[0].extras.blender).toEqual({ flavour: 'cycles' })
  })
})

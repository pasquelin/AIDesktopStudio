import { describe, expect, it } from 'vitest'
import { DOCUMENT_ID_KEY, DOCUMENT_KIND_KEY } from '@shared/domain/document'
import { MTLX_ROUGHNESS, type MtlxDocument } from '@shared/domain/materialX'
import { writeMaterialX } from '@main/assets/materialXFile'
import { createMaterialDocumentFormat } from './materialDocumentFormat'
import type { DocumentBodyFormat } from './documentBodyTypes'

const REFUSED: DocumentBodyFormat = {
  read: () => {
    throw new Error('Not a MaterialX document')
  },
  write: () => {
    throw new Error('Not a MaterialX document')
  },
  readHead: () => Promise.reject(new Error('Not a MaterialX document')),
}

const MATERIAL: MtlxDocument = {
  images: [],
  values: [{ input: MTLX_ROUGHNESS, type: 'float', value: 0.4 }],
}

const fileOf = (kind: string): Buffer =>
  Buffer.from(
    writeMaterialX(
      MATERIAL,
      JSON.stringify({ [DOCUMENT_ID_KEY]: 'm1', [DOCUMENT_KIND_KEY]: kind }),
    ),
    'utf8',
  )

describe('the kind a MaterialX file declares in its envelope', () => {
  /**
   * Read back rather than assumed: `keyOf(id, kind)` finds the document by the pair, so a file
   * reopened under a kind it never claimed is a document nothing can reach again.
   */
  it('is kept when the document knows it, and falls back to the material otherwise', () => {
    const format = createMaterialDocumentFormat(REFUSED)

    expect(format.read(fileOf('skybox')).kind).toBe('skybox')
    expect(format.read(fileOf('not-a-kind')).kind).toBe('material')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor, DocumentKind } from '@shared/domain/document'
import { installFakeBridge } from '@/services/fakeBridge'
import { noteOpenedDocument } from './recentDocuments'

const DOCUMENT: DocumentDescriptor = {
  id: 'one',
  kind: 'scene',
  workspace: '3d',
  title: 'Niveau',
  path: 'Modelling/Scenes/Niveau.gltf',
}

describe('noteOpenedDocument', () => {
  const told: [string, DocumentKind][] = []

  beforeEach(() => {
    vi.clearAllMocks()
    told.length = 0
    installFakeBridge({
      documents: {
        opened: (path: string, kind: DocumentKind) => {
          told.push([path, kind])
          return Promise.resolve()
        },
      },
    })
  })

  /**
   * The document and nothing else: the project holding it is composed on the other side, which
   * owns the open project — paired here, a document opened right after a project switch would be
   * filed under the one just left.
   */
  it('names the document, and leaves the project to the main process', async () => {
    await noteOpenedDocument(DOCUMENT)

    expect(told).toEqual([['Modelling/Scenes/Niveau.gltf', 'scene']])
  })

  /** A window with no bridge — a mirror, a test with no preload — must not throw for a shelf. */
  it('says nothing and throws nothing with no bridge', async () => {
    installFakeBridge({ documents: { opened: () => Promise.reject(new Error('gone')) } })

    await expect(noteOpenedDocument(DOCUMENT)).resolves.toBeUndefined()
  })
})

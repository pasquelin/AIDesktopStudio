import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import type { DocumentFile } from '@shared/domain/document'
import { DOCUMENT_VERSION, type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { restoreDocument, saveDocument } from './documentIoTest-fixtures'

describe('the kinds a string holds', () => {
  it('refuses to save a sequence whose file would not read', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({
      documents: {
        write,
        read: () =>
          Promise.resolve<DocumentFile | null>({
            version: DOCUMENT_VERSION,
            kind: 'sequence',
            title: 'Untitled',
            content: '{ not json',
            updatedAt: '2026-08-08T10:00:00.000Z',
          }),
      },
    })

    const created = await useDocuments.getState().create('video')
    if (!created) throw new Error('expected a document')
    await restoreDocument(created.id)

    await saveDocument(created.id)
    expect(write).not.toHaveBeenCalled()
  })
})

import { addClip } from '@/engines/timeline/commands'
import { makeClip } from '@/engines/timeline/timelineState'
import { installFakeBridge } from '@/services/fakeBridge'
import { isCodeDirty, scriptRefOf, useCode } from '@/stores/code'
import { useDocuments } from '@/stores/documents'
import { useSequences } from '@/stores/sequences'
import type { DocumentDraft, DocumentFile, DocumentKind } from '@shared/domain/document'
import { DOCUMENT_VERSION, type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { restoreDocument, saveDocument } from './documentIoTest-fixtures'

describe('the kinds a string holds', () => {
  const diskBackedBridge = (kind: DocumentKind): Map<string, string> => {
    const written = new Map<string, string>()
    installFakeBridge({
      documents: {
        write: (id: string, _kind: DocumentKind, draft: DocumentDraft) => {
          written.set(id, draft.content)
          return Promise.resolve<DocumentWrite>('written')
        },
        read: (id: string) => {
          const content = written.get(id)
          return Promise.resolve<DocumentFile | null>(
            content === undefined
              ? null
              : {
                  version: DOCUMENT_VERSION,
                  kind,
                  title: 'Untitled',
                  content,
                  updatedAt: '2026-08-08T10:00:00.000Z',
                },
          )
        },
      },
    })
    return written
  }

  const open = async (workspace: 'video' | 'audio' | 'skyboxes' | 'code'): Promise<string> => {
    const created = await useDocuments.getState().create(workspace)
    if (!created) throw new Error('expected a document')
    await restoreDocument(created.id)
    return created.id
  }

  it('carries a script to disk and back, as the text it is', async () => {
    const written = diskBackedBridge('script')
    const documentId = await open('code')
    const script = scriptRefOf(documentId)
    if (script === null) throw new Error('expected a script reference')

    useCode.getState().edited(script, 'export default 1\n')
    await saveDocument(documentId)

    // The BYTES, and it is what tells this kind from every other: nothing of the studio is
    // around the text — a `.ts` carrying an envelope is a file that does not compile.
    expect(written.get(documentId)).toBe('export default 1\n')

    useCode.getState().forget(script)
    await restoreDocument(documentId)
    expect(useCode.getState().files[script]?.source).toBe('export default 1\n')
  })

  it('holds a script clean once it has been written', async () => {
    diskBackedBridge('script')
    const documentId = await open('code')
    const script = scriptRefOf(documentId)
    if (script === null) throw new Error('expected a script reference')

    useCode.getState().edited(script, 'export default 2\n')
    expect(isCodeDirty(useCode.getState().files[script])).toBe(true)

    await saveDocument(documentId)
    expect(isCodeDirty(useCode.getState().files[script])).toBe(false)
  })

  it('carries a sequence to disk and back', async () => {
    diskBackedBridge('sequence')
    const documentId = await open('video')

    const clip = makeClip({ id: 'clip-1', assetId: 'asset-a', start: 0, duration: 2_000_000 })
    useSequences.getState().runCommand(documentId, addClip('V1', clip))
    const before = useSequences.getState().states[documentId]
    await saveDocument(documentId)

    useSequences.getState().drop(documentId)
    await restoreDocument(documentId)
    expect(useSequences.getState().states[documentId]).toEqual(before)
  })
})

import { pushEdit } from '@/engines/audio/edits'
import { addClip } from '@/engines/timeline/commands'
import { makeClip } from '@/engines/timeline/timelineState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAudioEdits } from '@/stores/audioEdits'
import { useDocuments } from '@/stores/documents'
import { useSequences } from '@/stores/sequences'
import type { DocumentDraft, DocumentFile, DocumentKind } from '@shared/domain/document'
import { DOCUMENT_VERSION, type DocumentWrite } from '@shared/domain/document'
import { otioStudioMetadata } from '@shared/domain/otio'
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

  it('writes a take as a timeline that says it is a take, chain and all', async () => {
    const written = diskBackedBridge('audio')
    const documentId = await open('audio')

    const clip = makeClip({ id: 'clip-a', assetId: 'asset-a', start: 0, duration: 2_000_000 })
    useSequences.getState().runCommand(documentId, addClip('A1', clip))
    useAudioEdits.getState().runCommand(documentId, pushEdit('clip-a', { kind: 'gain', db: -6 }))
    await saveDocument(documentId)

    const file: unknown = JSON.parse(written.get(documentId) ?? '{}')
    expect(file).toMatchObject({ OTIO_SCHEMA: 'Timeline.1' })
    expect(otioStudioMetadata(file).documentKind).toBe('audio')
    expect(otioStudioMetadata(file).audioEdits).toBeDefined()
  })

  it('gives back a chain the editor that opened the file cannot read', async () => {
    const written = diskBackedBridge('sequence')
    const documentId = await open('video')
    await saveDocument(documentId)

    const asWritten: Record<string, unknown> = JSON.parse(written.get(documentId) ?? '{}')
    const foreign = {
      ...asWritten,
      metadata: { aidesktopstudio: { audioEdits: { 'clip-a': [] } } },
    }
    written.set(documentId, JSON.stringify(foreign))
    useSequences.getState().drop(documentId)
    await restoreDocument(documentId)
    await saveDocument(documentId)

    expect(otioStudioMetadata(JSON.parse(written.get(documentId) ?? '{}')).audioEdits).toEqual({
      'clip-a': [],
    })
  })

  it('carries an edit chain to disk and back', async () => {
    diskBackedBridge('audio')
    const documentId = await open('audio')

    const clip = makeClip({ id: 'clip-a', assetId: 'asset-a', start: 0, duration: 2_000_000 })
    useSequences.getState().runCommand(documentId, addClip('A1', clip))
    useAudioEdits.getState().runCommand(documentId, pushEdit('clip-a', { kind: 'gain', db: -6 }))
    const before = useAudioEdits.getState().states[documentId]
    await saveDocument(documentId)

    useAudioEdits.getState().drop(documentId)
    await restoreDocument(documentId)
    expect(useAudioEdits.getState().states[documentId]).toEqual(before)
  })
})

import { EMPTY_AUDIO_EDIT, pushEdit } from '@/engines/audio/edits'
import { addClip, removeTrack } from '@/engines/timeline/commands'
import { EMPTY_SOUND_SEQUENCE, makeClip } from '@/engines/timeline/timelineState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAudioEdits } from '@/stores/audioEdits'
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

  it('leaves behind the chains of blocks the montage no longer holds', async () => {
    diskBackedBridge('audio')
    const documentId = await open('audio')

    useAudioEdits.getState().runCommand(documentId, pushEdit('clip-gone', { kind: 'gain', db: -6 }))
    await saveDocument(documentId)

    useAudioEdits.getState().drop(documentId)
    await restoreDocument(documentId)

    expect(useAudioEdits.getState().states[documentId]).toEqual(EMPTY_AUDIO_EDIT)
  })

  it('carries the sound montage of a take to disk and back', async () => {
    diskBackedBridge('audio')
    const documentId = await open('audio')

    const clip = makeClip({ id: 'clip-1', assetId: 'asset-a', start: 0, duration: 2_000_000 })
    useSequences.getState().runCommand(documentId, addClip('A1', clip))
    const before = useSequences.getState().states[documentId]
    await saveDocument(documentId)

    useSequences.getState().drop(documentId)
    useAudioEdits.getState().drop(documentId)
    await restoreDocument(documentId)

    expect(useSequences.getState().states[documentId]).toEqual(before)
  })

  it('reopens a take whose montage was emptied without handing it a picture track', async () => {
    diskBackedBridge('audio')
    const documentId = await open('audio')

    for (const track of useSequences.getState().states[documentId]?.tracks ?? []) {
      useSequences.getState().runCommand(documentId, removeTrack(track.id))
    }
    await saveDocument(documentId)

    useSequences.getState().drop(documentId)
    useAudioEdits.getState().drop(documentId)
    await restoreDocument(documentId)

    expect(useSequences.getState().states[documentId]).toEqual(EMPTY_SOUND_SEQUENCE)
  })
})

import { EMPTY_AUDIO_EDIT } from '@/engines/audio/edits'
import { setSunAngles } from '@/engines/skybox/commands'
import { addClip } from '@/engines/timeline/commands'
import { EMPTY_SOUND_SEQUENCE, makeClip } from '@/engines/timeline/timelineState'
import { getBridge } from '@/services/bridge'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAudioEdits } from '@/stores/audioEdits'
import { useDocuments } from '@/stores/documents'
import { sequenceStore, useSequences } from '@/stores/sequences'
import { useSkyboxes } from '@/stores/skyboxes'
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

  it('opens a take saved with no montage at all', async () => {
    diskBackedBridge('audio')
    const documentId = await open('audio')

    await getBridge()?.documents.write(documentId, 'audio', {
      title: 'Untitled',
      content: JSON.stringify({
        assetId: 'asset-a',
        edits: [{ kind: 'trimSilence' }],
        region: null,
        bypassed: false,
      }),
    })

    useSequences.getState().drop(documentId)
    useAudioEdits.getState().drop(documentId)
    await restoreDocument(documentId)

    expect(useAudioEdits.getState().states[documentId]).toEqual(EMPTY_AUDIO_EDIT)
    expect(useSequences.getState().states[documentId]).toEqual(EMPTY_SOUND_SEQUENCE)
  })

  it('carries a sky to disk and back', async () => {
    diskBackedBridge('skybox')
    const documentId = await open('skyboxes')

    useSkyboxes.getState().runCommand(documentId, setSunAngles({ elevation: 0.3, azimuth: 1 }))
    const before = useSkyboxes.getState().states[documentId]
    await saveDocument(documentId)

    useSkyboxes.getState().drop(documentId)
    await restoreDocument(documentId)
    expect(useSkyboxes.getState().states[documentId]).toEqual(before)
  })

  it('opens a document read back from disk unmodified', async () => {
    diskBackedBridge('sequence')
    const documentId = await open('video')

    const clip = makeClip({ id: 'clip-1', assetId: 'asset-a', start: 0, duration: 2_000_000 })
    useSequences.getState().runCommand(documentId, addClip('V1', clip))
    await saveDocument(documentId)

    useSequences.getState().drop(documentId)
    await restoreDocument(documentId)
    expect(sequenceStore.isDirty(useSequences.getState(), documentId)).toBe(false)
  })
})

import type { DocumentDescriptor, DocumentKind } from '@shared/domain/document'
import type { DocumentRevisionSnapshot, DocumentStateSnapshot } from '@shared/domain/documentState'
import { audioEditStore } from '@/stores/audioEdits'
import { canvasStore } from '@/stores/canvases'
import { characterStore } from '@/stores/character'
import { useCode } from '@/stores/code'
import { scriptRefAt } from '@/stores/code'
import { characterAssetOf, useDocuments } from '@/stores/documents'
import { guiStore } from '@/stores/gui'
import { materialStore } from '@/stores/materials'
import { sceneStore } from '@/stores/scenes'
import { sequenceStore } from '@/stores/sequences'
import { skyboxStore } from '@/stores/skyboxes'
import type { DocumentStore } from '@/stores/documentStore'

type StateReading = { incarnation: string; revision: number; state: unknown }
type StateProvider = (document: DocumentDescriptor) => StateReading | null

function fromStore<S>(
  store: Pick<DocumentStore<S>, 'use' | 'hasState' | 'stateOf' | 'revisionOf' | 'incarnationOf'>,
  documentId: string,
): StateReading | null {
  const current = store.use.getState()
  const incarnation = store.incarnationOf(current, documentId)
  return store.hasState(current, documentId) && incarnation
    ? {
        incarnation,
        revision: store.revisionOf(current, documentId),
        state: store.stateOf(current, documentId),
      }
    : null
}

const PROVIDERS: Record<DocumentKind, StateProvider> = {
  image: document => fromStore(canvasStore, document.id),
  scene: document => fromStore(sceneStore, document.id),
  sequence: document => fromStore(sequenceStore, document.id),
  audio: document => {
    const sequence = fromStore(sequenceStore, document.id)
    const edits = fromStore(audioEditStore, document.id)
    if (!sequence || !edits) return null
    return {
      revision: sequence.revision + edits.revision,
      incarnation: `${sequence.incarnation}:${edits.incarnation}`,
      state: { sequence: sequence.state, edits: edits.state },
    }
  },
  skybox: document => fromStore(skyboxStore, document.id),
  material: document => fromStore(materialStore, document.id),
  gui: document => fromStore(guiStore, document.id),
  character: document => {
    const assetId = characterAssetOf(useDocuments.getState(), document.id)
    return assetId === null ? null : fromStore(characterStore, assetId)
  },
  script: document => {
    const code = useCode.getState()
    const script = document.path === null ? null : scriptRefAt(document.path)
    const file = script === null ? undefined : code.files[script]
    return file
      ? {
          incarnation: code.resourceIncarnations[file.script] ?? 'unknown-script',
          revision: code.resourceRevisions[file.script] ?? 0,
          state: { source: file.source },
        }
      : null
  },
}

export function documentStateOf(document: DocumentDescriptor): DocumentStateSnapshot | null {
  const reading = PROVIDERS[document.kind](document)
  return reading
    ? {
        documentId: document.id,
        kind: document.kind,
        incarnation: reading.incarnation,
        revision: reading.revision,
        state: reading.state,
      }
    : null
}

export function documentRevisionOf(document: DocumentDescriptor): DocumentRevisionSnapshot | null {
  const snapshot = documentStateOf(document)
  if (!snapshot) return null
  return {
    documentId: snapshot.documentId,
    kind: snapshot.kind,
    incarnation: snapshot.incarnation,
    revision: snapshot.revision,
  }
}

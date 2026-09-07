import type * as CharacterSave from '@/character/characterSave'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { forgetReportedFailures } from '@/services/diagnostics'
import { useDocuments } from '@/stores/documents'
import { clearScenes } from '@/stores/scene-fixtures'
import type { Asset } from '@shared/domain/asset'
import type { DocumentDescriptor, DocumentFile } from '@shared/domain/document'
import { DOCUMENT_VERSION } from '@shared/domain/document'
import type { RigBone } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { beforeEach, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
const closePanel = vi.fn()
const openDocument = vi.fn()
const closeWindow = vi.spyOn(window, 'close').mockImplementation(() => {})
vi.mock('./components/dockviewApi', () => ({
  closePanel: (id: string) => closePanel(id),
  openDocument: (document: DocumentDescriptor) => openDocument(document),
}))

const box = meshNode('box-1')

/** What `savePicture` answers with — only its shape matters to a caller that discards it. */
const picture = (): Asset => ({
  id: 'asset-1',
  name: 'Gemini 3.1',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-12T10:00:00.000Z',
})

const savedFile = (): DocumentFile => ({
  version: DOCUMENT_VERSION,
  kind: 'scene',
  title: 'Set dressing',
  // Serialized, as it crosses the boundary: the file layer never parses a content.
  content: JSON.stringify({ nodes: [box] }),
  updatedAt: '2026-08-07T10:00:00.000Z',
})

function scene(id: string): DocumentDescriptor {
  return {
    id,
    kind: 'scene',
    title: 'Set dressing',
    workspace: '3d',
    path: `documents/${id}.gltf`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  closeWindow.mockClear()
  localStorage.clear()
  clearScenes()
  forgetReportedFailures()
  useDocuments.setState({ documents: {}, activeId: null })
})

/** The pixels a fake engine hands over: bytes, as `LayerPixels` and `OraSurface` now carry them. */
const PIXELS = new Uint8Array([137, 80, 78, 71])

/** An image document's content: the OpenRaster stack, as JSON, with the studio state inside it. */
const oraContent = (studio: string): string =>
  JSON.stringify({ width: 64, height: 32, nodes: [], studio })

/** Every character tab ⌘S reached. The patch itself is `characterSave`'s own suite. */
const patched = vi.hoisted((): string[] => [])

vi.mock('@/character/characterSave', async importOriginal => ({
  ...(await importOriginal<typeof CharacterSave>()),
  saveCharacterDocument: (documentId: string) => {
    patched.push(documentId)
    return Promise.resolve(true)
  },
}))

const {
  autosaveOpenDocuments,
  closeDocument,
  deleteDocument,
  renamedDocumentProject,
  refreshDocuments,
  rehydrateDocument,
  restoreDocument,
  saveDocument,
  saveDocumentAs,
  settleUnsavedWork,
  settleUnsavedWorkForProjectChange,
  unsavedDocumentIds,
} = await import('./documentIo')

/** One bone, so a case can read back what ⌘S wrote into the skeleton of the model. */
const BONE: RigBone = { name: 'Spine', parent: null, rest: IDENTITY_TRANSFORM }
const RAISED = { ...IDENTITY_TRANSFORM, position: { x: 0, y: 0.2, z: 0 } }

export {
  autosaveOpenDocuments,
  BONE,
  box,
  closeDocument,
  closePanel,
  closeWindow,
  deleteDocument,
  openDocument,
  oraContent,
  patched,
  picture,
  PIXELS,
  RAISED,
  refreshDocuments,
  renamedDocumentProject,
  rehydrateDocument,
  restoreDocument,
  savedFile,
  saveDocument,
  saveDocumentAs,
  scene,
  settleUnsavedWork,
  settleUnsavedWorkForProjectChange,
  unsavedDocumentIds,
}

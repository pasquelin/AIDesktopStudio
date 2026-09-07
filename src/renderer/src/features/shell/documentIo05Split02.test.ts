import { newMaterial } from '@/engines/material/materialState'
import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { showPanels } from '@/stores/layout-fixtures'
import { useMaterials } from '@/stores/materials'
import { inspectedChannel, useMaterialViews } from '@/stores/materialViews'
import { isClipMonitorShown, useMonitorPair } from '@/stores/monitorPair'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { CloseChoice } from '@shared/domain/document'
import { type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import {
  box,
  closeDocument,
  refreshDocuments,
  renamedDocumentProject,
  restoreDocument,
  savedFile,
  scene,
  settleUnsavedWork,
  settleUnsavedWorkForProjectChange,
  unsavedDocumentIds,
} from './documentIoTest-fixtures'

describe('closing a document', () => {
  const openDirtyScene = async (): Promise<string> => {
    installFakeBridge({ documents: { write: () => Promise.resolve<DocumentWrite>('written') } })
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  it('keeps a discarded document until the project change it was asked for happens', async () => {
    const documentId = await openDirtyScene()
    installFakeBridge({
      documents: { confirmClose: () => Promise.resolve<CloseChoice>('discard') },
    })

    await expect(settleUnsavedWorkForProjectChange()).resolves.toBe(true)

    expect(useDocuments.getState().documents[documentId]).toBeDefined()
    expect(unsavedDocumentIds()).toEqual([documentId])
  })

  it('writes a document it was told to save, and keeps its tab', async () => {
    const documentId = await openDirtyScene()
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({
      documents: { write, confirmClose: () => Promise.resolve<CloseChoice>('save') },
    })

    await expect(settleUnsavedWorkForProjectChange()).resolves.toBe(true)

    expect(write).toHaveBeenCalledTimes(1)
    expect(useDocuments.getState().documents[documentId]).toBeDefined()
  })

  it('still forgets what it was told to discard when the window is leaving', async () => {
    const documentId = await openDirtyScene()
    installFakeBridge({
      documents: { confirmClose: () => Promise.resolve<CloseChoice>('discard') },
    })

    await expect(settleUnsavedWork()).resolves.toBe(true)

    expect(useDocuments.getState().documents[documentId]).toBeUndefined()
  })

  it('forgets which channel a closed texture was being looked at through', async () => {
    installFakeBridge({})
    const created = await useDocuments.getState().create('materials')
    if (!created) throw new Error('expected a document')
    useMaterialViews.getState().inspect(created.id, 'normal')

    await expect(closeDocument(created.id)).resolves.toBe(true)

    expect(inspectedChannel(useMaterialViews.getState(), created.id)).toBeNull()
  })

  it('forgets that a closed montage had its clip monitor open', async () => {
    installFakeBridge({})
    const created = await useDocuments.getState().create('video')
    if (!created) throw new Error('expected a document')
    useMonitorPair.getState().toggleClipMonitor(created.id)

    await expect(closeDocument(created.id)).resolves.toBe(true)

    expect(isClipMonitorShown(useMonitorPair.getState(), created.id)).toBe(false)
  })

  it('forgets the session views of documents a project change dropped', async () => {
    installFakeBridge({})
    const left = await useDocuments.getState().create('materials')
    const kept = await useDocuments.getState().create('materials')
    if (!left || !kept) throw new Error('expected two documents')
    useMaterialViews.getState().inspect(left.id, 'normal')
    useMaterialViews.getState().inspect(kept.id, 'roughness')
    // The state a `DocumentIo` holds only exists once something has opened the document.
    useMaterials.getState().ensure(left.id, newMaterial)
    useMaterials.getState().ensure(kept.id, newMaterial)

    // The folder of the project being opened holds one of the two, and the layout says it is
    // open — which is what makes the other one a tab the refresh drops.
    installFakeBridge({ documents: { list: () => Promise.resolve([kept]) } })
    showPanels('textures', kept.id)

    await expect(refreshDocuments()).resolves.toBe(true)

    expect(inspectedChannel(useMaterialViews.getState(), left.id)).toBeNull()
    expect(inspectedChannel(useMaterialViews.getState(), kept.id)).toBe('roughness')
    // The heavy half: `ioOf` reads the kind from the map the refresh has just emptied, so the
    // engine state was the one thing a project change could not drop.
    expect(useMaterials.getState().states[left.id]).toBeUndefined()
    expect(useMaterials.getState().states[kept.id]).toBeDefined()
  })

  it('reloads a same-id document when the project path changes', async () => {
    installFakeBridge({ documents: { list: () => Promise.resolve([]) } })
    await refreshDocuments('project-old')
    const document = scene('doc-1')
    useDocuments.setState({ documents: { 'doc-1': document } })
    showPanels('3d', 'doc-1')
    useScenes.getState().runCommand('doc-1', addNode(meshNode('from-old-project')))
    installFakeBridge({
      documents: {
        list: () => Promise.resolve([document]),
        read: () => Promise.resolve(savedFile()),
      },
    })

    await refreshDocuments('project-new')
    await restoreDocument('doc-1')

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toEqual([box])
  })

  it('keeps a same-id document alive when its open project was only renamed', async () => {
    installFakeBridge({ documents: { list: () => Promise.resolve([]) } })
    await refreshDocuments('project-before-rename')
    const document = scene('doc-1')
    useDocuments.setState({ documents: { 'doc-1': document } })
    showPanels('3d', 'doc-1')
    const local = meshNode('kept-after-rename')
    useScenes.getState().runCommand('doc-1', addNode(local))
    installFakeBridge({ documents: { list: () => Promise.resolve([document]) } })

    renamedDocumentProject('project-before-rename', 'project-after-rename')
    await refreshDocuments('project-after-rename')

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toEqual([local])
  })
})

import { addNode } from '@/engines/scene/commands'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { bridgeWatchingLogs, installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { isSceneDirty, sceneOf, useScenes } from '@/stores/scenes'
import type { DocumentDraft, DocumentFile, DocumentKind } from '@shared/domain/document'
import { FILED_KINDS, workspaceForKind, type DocumentWrite } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import { box, restoreDocument, saveDocument, savedFile, scene } from './documentIoTest-fixtures'

describe('restoreDocument', () => {
  it('reads a saved document back from the project', async () => {
    installFakeBridge({ documents: { read: () => Promise.resolve(savedFile()) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toEqual([box])
    expect(isSceneDirty(useScenes.getState(), 'doc-1')).toBe(false)
  })

  // `null` is what a document that was never saved reads as — not a failure, and not a reason
  // to leave the viewport black.
  it('lights a document the project holds no file for', async () => {
    installFakeBridge({ documents: { read: () => Promise.resolve(null) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toHaveLength(3)
  })

  it('asks for the document by its own id and kind', async () => {
    const read = vi.fn(() => Promise.resolve(savedFile()))
    installFakeBridge({ documents: { read } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    expect(read).toHaveBeenCalledWith('doc-1', 'scene')
  })

  it('leaves a tab that already holds a scene alone', async () => {
    const read = vi.fn(() => Promise.resolve(savedFile()))
    installFakeBridge({ documents: { read } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })
    useScenes.getState().runCommand('doc-1', addNode(box))

    await restoreDocument('doc-1')
    expect(read).not.toHaveBeenCalled()
  })

  // A default scene put up in its place is a scene a later ⌘S would write over the file.
  it('does not stand a default scene in for a file that will not read', async () => {
    installFakeBridge({ documents: { read: () => Promise.reject(new Error('gone')) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    expect(useScenes.getState().states['doc-1']).toBeUndefined()
    expect(isSceneDirty(useScenes.getState(), 'doc-1')).toBe(true)
  })

  // The tab is live while the read is in flight, and the Add menu acts on it. Overwriting that
  // edit would also mark the document clean, leaving an undo stack describing a scene that never
  // existed.
  it('keeps an edit made while the read was in flight', async () => {
    let deliver = (): void => {}
    installFakeBridge({
      documents: {
        read: () =>
          new Promise<DocumentFile>(resolve => {
            deliver = () => resolve(savedFile())
          }),
      },
    })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    const reading = restoreDocument('doc-1')
    useScenes.getState().runCommand('doc-1', addNode(meshNode('box-2')))
    deliver()
    await reading

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes.map(node => node.id)).toEqual(['box-2'])
    expect(isSceneDirty(useScenes.getState(), 'doc-1')).toBe(true)
  })

  // React's StrictMode runs every mount effect twice, and switching workspace remounts the
  // panel: without this, one open is two reads of the same file.
  it('reads once for a panel that mounts twice', async () => {
    const read = vi.fn(() => Promise.resolve(savedFile()))
    installFakeBridge({ documents: { read } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await Promise.all([restoreDocument('doc-1'), restoreDocument('doc-1')])
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('keeps a pending read valid when only the descriptor title changes', async () => {
    let deliver = (): void => {}
    installFakeBridge({
      documents: {
        read: () =>
          new Promise<DocumentFile>(resolve => {
            deliver = () => resolve(savedFile())
          }),
      },
    })
    const document = scene('doc-1')
    useDocuments.setState({ documents: { 'doc-1': document } })

    const reading = restoreDocument('doc-1')
    useDocuments.setState({
      documents: { 'doc-1': { ...document, title: 'Renamed while reading' } },
    })
    deliver()
    await reading

    expect(sceneOf(useScenes.getState(), 'doc-1').nodes).toEqual([box])
  })

  // The empty editor a failed read leaves is indistinguishable from a new document, and the
  // refusal to save it then reads as a ⌘S that does nothing. This is the only place that knows.
  it('reports a document whose file would not read', async () => {
    const bridge = bridgeWatchingLogs({
      documents: { read: () => Promise.reject(new Error('gone')) },
    })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')

    expect(bridge.entries()[0]).toMatchObject({
      level: 'error',
      scope: 'document.load',
      message: expect.stringContaining('gone'),
    })
  })

  it('says nothing for a document the project simply holds no file for', async () => {
    const bridge = bridgeWatchingLogs({ documents: { read: () => Promise.resolve(null) } })
    useDocuments.setState({ documents: { 'doc-2': scene('doc-2') } })

    await restoreDocument('doc-2')
    expect(bridge.entries()).toEqual([])
  })

  // A kind absent from the table has a Save that does nothing and a tab that never reads its
  // file — silently. This is what says the table still covers every kind that HAS a file: the
  // character has none, and `assetOnly` is what stops the read.
  it('reads the file of every kind filed in the project', async () => {
    const read = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ documents: { read } })

    for (const kind of FILED_KINDS) {
      const workspace = workspaceForKind(kind)
      if (!workspace) throw new Error(`no workspace opens ${kind}`)
      const id = `doc-${kind}`
      useDocuments.setState({
        documents: { [id]: { id, kind, title: kind, workspace, path: `documents/${kind}${id}` } },
      })
      await restoreDocument(id)
    }

    expect(read).toHaveBeenCalledTimes(FILED_KINDS.length)
  })
})

// A draft is what the file layer stamps its envelope onto; the renderer supplies neither the
// version nor the timestamp, and this is the shape that has to keep matching.
describe('what reaches the bridge', () => {
  it('hands over a draft, not a file', async () => {
    let draft: DocumentDraft | null = null
    installFakeBridge({
      documents: {
        write: (_id: string, _kind: DocumentKind, given: DocumentDraft) => {
          draft = given
          return Promise.resolve<DocumentWrite>('written')
        },
      },
    })

    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    await saveDocument(created.id)

    expect(Object.keys(draft ?? {}).sort()).toEqual(['content', 'title'])
  })
})

/**
 * The image is the one kind a string cannot hold: its pixels live in GPU textures, so the stack
 * goes in the manifest and each layer's picture in a file beside it. What is checked here is the
 * seam — that the engine holding the document is asked, and that what came back reaches it again.
 */

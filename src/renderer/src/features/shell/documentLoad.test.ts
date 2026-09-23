import { addNode } from '@/engines/scene/commands'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import type { DocumentFile } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'
import {
  box,
  closeDocument,
  refreshDocuments,
  restoreDocument,
  savedFile,
  scene,
} from './documentIoTest-fixtures'

/** A read held open, so a case can act between the ask and the file landing. */
function heldRead(): { deliver: () => void } {
  const held = { deliver: (): void => {} }
  installFakeBridge({
    documents: {
      list: () => Promise.resolve([]),
      read: () =>
        new Promise<DocumentFile>(resolve => {
          held.deliver = () => resolve(savedFile())
        }),
    },
  })
  return held
}

/**
 * The answer a caller from outside the window acts on: `document.open` announces success on it,
 * so what it says apart is what stops a client from reading an empty tab as a restored one.
 */
describe('what restoring a document answers', () => {
  it('is ready once the file is installed', async () => {
    installFakeBridge({ documents: { read: () => Promise.resolve(savedFile()) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    expect(await restoreDocument('doc-1')).toEqual({ state: 'ready' })
  })

  // The empty editor a failed read leaves is indistinguishable from a new document: a caller
  // told `ok` writes into it, and ⌘S puts that over the file it could not read.
  it('carries the error of a file that would not read', async () => {
    const gone = new Error('gone')
    installFakeBridge({ documents: { read: () => Promise.reject(gone) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    expect(await restoreDocument('doc-1')).toEqual({ state: 'unreadable', error: gone })
  })

  it('is ready for a tab that already holds its scene', async () => {
    installFakeBridge({ documents: { read: () => Promise.resolve(savedFile()) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })
    useScenes.getState().runCommand('doc-1', addNode(box))

    expect(await restoreDocument('doc-1')).toEqual({ state: 'ready' })
  })

  it('answers nothing opened for an id no tab holds', async () => {
    installFakeBridge()

    expect(await restoreDocument('doc-nowhere')).toEqual({ state: 'noDocument' })
  })

  // Both callers are answered, and the file is read once: a panel mounting twice under StrictMode
  // and an action asked for from outside are the same read.
  it('answers every caller of one read alike', async () => {
    const read = vi.fn(() => Promise.resolve(savedFile()))
    installFakeBridge({ documents: { read } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    expect(await Promise.all([restoreDocument('doc-1'), restoreDocument('doc-1')])).toEqual([
      { state: 'ready' },
      { state: 'ready' },
    ])
    expect(read).toHaveBeenCalledTimes(1)
  })

  // Cancelled rather than failed, and nothing installed: the tab the file was meant for is gone,
  // and a caller told `unreadable` would go looking for a file that reads perfectly well.
  it('drops a read the closing of its tab outran', async () => {
    const held = heldRead()
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    const reading = restoreDocument('doc-1')
    await closeDocument('doc-1')
    held.deliver()

    expect(await reading).toEqual({ state: 'cancelled' })
    expect(useScenes.getState().states['doc-1']).toBeUndefined()
  })

  it('drops a read the project change outran', async () => {
    const held = heldRead()
    // Named twice: the first call is what the second is a CHANGE from — nothing has moved yet.
    await refreshDocuments('/Films/One')
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    const reading = restoreDocument('doc-1')
    await refreshDocuments('/Films/Two')
    held.deliver()

    expect(await reading).toEqual({ state: 'cancelled' })
    expect(useScenes.getState().states['doc-1']).toBeUndefined()
  })
})

import { workshopIdOf } from '@shared/domain/character'
import { setCharacterBoneRest } from '@/engines/character/characterCommands'
import { addNode } from '@/engines/scene/commands'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { sceneFromGltf } from '@/engines/scene/gltfDocument'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { characterStore, seedCharacter, useCharacters } from '@/stores/character'
import { installCharacterDocument } from '@/stores/character-fixtures'
import { useDocuments } from '@/stores/documents'
import { isSceneDirty, sceneStore, useScenes } from '@/stores/scenes'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import type { CloseChoice, DocumentDraft, DocumentKind } from '@shared/domain/document'
import { documentFolderOf, type DocumentWrite } from '@shared/domain/document'
import { isGltfDocument } from '@shared/domain/gltf'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import { describe, expect, it, vi } from 'vitest'

// The real one needs a live Dockview; what this file checks is that closing and opening reach it.
import {
  BONE,
  RAISED,
  box,
  keepUnsavedWorkSafe,
  closeDocument,
  patched,
  restoreDocument,
  saveDocument,
  scene,
} from './documentIoTest-fixtures'

describe('saveDocument', () => {
  const openScene = async (): Promise<string> => {
    const created = await useDocuments.getState().create('3d')
    if (!created) throw new Error('expected a document')
    useScenes.getState().runCommand(created.id, addNode(box))
    return created.id
  }

  it('writes no project file for a character, and patches its model instead', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write } })
    installCharacterDocument('doc-hero', 'asset-hero')
    seedCharacter('asset-hero', { origin: 'local', bones: [BONE] }, {})
    useCharacters.getState().runCommand('asset-hero', setCharacterBoneRest('Spine', RAISED))

    expect(await saveDocument('doc-hero')).toBe(true)

    expect(write).not.toHaveBeenCalled()
    // What the patch itself does — the container rebuilt, the weights of the moment — is
    // measured where it lives, in `characterSave.test.ts`.
    expect(patched).toEqual(['doc-hero'])
  })

  it('lets go of the skeleton and its workshop when the character tab closes', async () => {
    installFakeBridge()
    installCharacterDocument('doc-hero', 'asset-hero')
    seedCharacter('asset-hero', { origin: 'local', bones: [BONE] }, {})
    sceneStore.use.getState().replace(workshopIdOf('asset-hero'), createDefaultScene())

    await closeDocument('doc-hero')

    expect(characterStore.hasState(useCharacters.getState(), 'asset-hero')).toBe(false)
    expect(sceneStore.hasState(useScenes.getState(), workshopIdOf('asset-hero'))).toBe(false)
  })

  it('reads no file back for a character tab', async () => {
    const read = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ documents: { read } })
    installCharacterDocument('doc-hero', 'asset-hero')

    await restoreDocument('doc-hero')

    expect(read).not.toHaveBeenCalled()
  })

  it('writes the scene as glTF, and only what a scene is — never its selection', async () => {
    const write = vi.fn((_id: string, _kind: DocumentKind, _draft: DocumentDraft) =>
      Promise.resolve<DocumentWrite>('written'),
    )
    installFakeBridge({ documents: { write } })

    const documentId = await openScene()
    await saveDocument(documentId)

    expect(write).toHaveBeenCalledWith(
      documentId,
      'scene',
      { title: expect.any(String), content: expect.any(String) },
      false,
      // Where the descriptor says it goes, which a first save reads and a later one ignores.
      documentFolderOf('scene'),
    )

    // What was written is read back rather than compared to a spelling: the file is a standard
    // one now, and pinning its exact bytes here would break on every field the format gains.
    const written: unknown = JSON.parse(String(write.mock.calls[0]?.[2].content))
    expect(isGltfDocument(written)).toBe(true)
    expect(sceneFromGltf(written)).toEqual({
      nodes: [box],
      selectedIds: [],
      world: DEFAULT_WORLD,
      animation: EMPTY_TIMELINE,
    })
  })

  it('marks the document clean once it is written', async () => {
    installFakeBridge({ documents: { write: () => Promise.resolve<DocumentWrite>('written') } })

    const documentId = await openScene()
    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)

    await saveDocument(documentId)
    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(false)
  })

  it('asks before writing over an outside change, and writes nothing when refused', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('stale'))
    const confirmOverwrite = vi.fn(() => Promise.resolve(false))
    installFakeBridge({ documents: { write, confirmOverwrite } })

    const documentId = await openScene()

    await expect(saveDocument(documentId)).resolves.toBe(false)
    expect(confirmOverwrite).toHaveBeenCalled()
    expect(write).toHaveBeenCalledTimes(1)
    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)
  })

  it('writes over an outside change once the user agrees, and says it insisted', async () => {
    const forced: (boolean | undefined)[] = []
    const write = (
      _id: string,
      _kind: DocumentKind,
      _draft: DocumentDraft,
      force?: boolean,
    ): Promise<DocumentWrite> => {
      forced.push(force)
      return Promise.resolve('stale')
    }
    installFakeBridge({ documents: { write, confirmOverwrite: () => Promise.resolve(true) } })

    const documentId = await openScene()
    await expect(saveDocument(documentId)).resolves.toBe(true)

    // The second call is the whole point: the first asked, the second insisted. Spelt out on
    // both, the landing folder following it in the same call.
    expect(forced).toEqual([false, true])
  })

  /**
   * The net, since 2026-09-10: it writes into the recovery area and no longer into the user's
   * own files. Writing them WAS how it worked, and it is how opening a video came to leave an
   * `.otio` beside it — `documentRecovery.test.ts` holds what the net now writes.
   */
  describe('the pass that runs on a timer', () => {
    it('writes no file of the user for a document the recovery holds', async () => {
      const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
      installFakeBridge({ documents: { write } })
      const documentId = await openScene()

      await keepUnsavedWorkSafe()

      expect(write).not.toHaveBeenCalled()
      // And the work is still unsaved, which is the truth: nothing was written to its file.
      expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)
    })

    /**
     * A native dialog blocks the user's input, not the renderer's timers. Writing while the
     * "Save / Don't Save" question is on screen answers it for them: the tab then closes over
     * work the user had just declined to save.
     */
    it('writes nothing while a close question is on screen', async () => {
      const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
      let answer: (choice: CloseChoice) => void = () => {}
      installFakeBridge({
        documents: { write, confirmClose: () => new Promise<CloseChoice>(r => (answer = r)) },
      })
      const documentId = await openScene()

      const closing = closeDocument(documentId)
      await keepUnsavedWorkSafe()
      expect(write).not.toHaveBeenCalled()

      answer('discard')
      await closing
    })
  })

  it('leaves the document modified when the write fails', async () => {
    installFakeBridge({ documents: { write: () => Promise.reject(new Error('no project')) } })

    const documentId = await openScene()
    await expect(saveDocument(documentId)).rejects.toThrow()
    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)
  })

  it('does not count an edit made while the file was being written', async () => {
    let release = (): void => {}
    let started = (): void => {}
    const writeStarted = new Promise<void>(resolve => {
      started = resolve
    })
    installFakeBridge({
      documents: {
        write: () => {
          started()
          return new Promise<DocumentWrite>(resolve => {
            release = () => resolve('written')
          })
        },
      },
    })

    const documentId = await openScene()
    const writing = saveDocument(documentId)
    // `capture` is asynchronous — an image extracts its pixels off the GPU before the write — so
    // the write is booked a microtask later than the call, not within it.
    await writeStarted

    useScenes.getState().runCommand(documentId, addNode(meshNode('box-2')))
    release()
    await writing

    expect(isSceneDirty(useScenes.getState(), documentId)).toBe(true)
  })

  it('refuses to write a document whose state never loaded', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write, read: () => Promise.reject(new Error('gone')) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    await saveDocument('doc-1')

    expect(write).not.toHaveBeenCalled()
  })

  it('keeps refusing to write once the user has drawn in a document that would not load', async () => {
    const write = vi.fn(() => Promise.resolve<DocumentWrite>('written'))
    installFakeBridge({ documents: { write, read: () => Promise.reject(new Error('gone')) } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })

    await restoreDocument('doc-1')
    useScenes.getState().runCommand('doc-1', addNode(box))
    await saveDocument('doc-1')

    expect(write).not.toHaveBeenCalled()
  })
})

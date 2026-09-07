import { addNode } from '@/engines/scene/commands'
import type { SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useScenes } from '@/stores/scenes'
import type { CloseChoice } from '@shared/domain/document'
import { describe, expect, it, vi } from 'vitest'
import { box, closeDocument, saveDocument, scene } from './documentIoTest-fixtures'

const encode = vi.hoisted(() => vi.fn())

vi.mock('./sceneDocumentCodec', () => ({ sceneDocumentCodec: { encode } }))

describe('document conversion lifecycle', () => {
  it('does not write or commit a capture invalidated by closing with discard', async () => {
    encode.mockImplementation(
      (_state: SceneState, _documentId: string, signal?: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          const abort = (): void =>
            reject(new DOMException('scene document conversion was cancelled', 'AbortError'))
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) abort()
        }),
    )
    const write = vi.fn()
    installFakeBridge({
      documents: {
        write,
        confirmClose: () => Promise.resolve<CloseChoice>('discard'),
      },
    })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })
    useScenes.getState().runCommand('doc-1', addNode(box))

    const saving = saveDocument('doc-1')
    await Promise.resolve()
    await closeDocument('doc-1')

    await expect(saving).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(useScenes.getState().states['doc-1']).toBeUndefined()
  })

  it('keeps overwrite confirmation and disk writes in save invocation order', async () => {
    let releaseFirstCapture: ((content: string) => void) | undefined
    encode
      .mockImplementationOnce(
        () =>
          new Promise<string>(resolve => {
            releaseFirstCapture = resolve
          }),
      )
      .mockResolvedValueOnce('second')
    const forced: string[] = []
    const write = vi.fn(
      (
        _id: string,
        _kind: string,
        draft: { content: string },
        force?: boolean,
      ): Promise<'written' | 'stale'> => {
        if (force) forced.push(draft.content)
        return Promise.resolve(force ? 'written' : 'stale')
      },
    )
    const confirmOverwrite = vi.fn(() => Promise.resolve(true))
    installFakeBridge({ documents: { write, confirmOverwrite } })
    useDocuments.setState({ documents: { 'doc-1': scene('doc-1') } })
    useScenes.getState().runCommand('doc-1', addNode(box))

    const first = saveDocument('doc-1')
    const second = saveDocument('doc-1')
    await Promise.resolve()

    expect(confirmOverwrite).not.toHaveBeenCalled()
    releaseFirstCapture?.('first')
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)

    expect(forced).toEqual(['first', 'second'])
    expect(confirmOverwrite).toHaveBeenCalledTimes(2)
  })
})

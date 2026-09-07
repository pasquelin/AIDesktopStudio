import { createDefaultScene } from '@/engines/scene/defaultScene'
import { meshNode } from '@/engines/scene/scene-fixtures'
import type { SceneNode } from '@/engines/scene/sceneState'
import { describe, expect, it } from 'vitest'
import { scenePayloadOf } from './sceneDocument'
import { sceneDocumentText } from './sceneDocumentText'
import { createSceneDocumentCodec } from './sceneDocumentCodec'

class CodecWorker extends EventTarget {
  readonly messages: unknown[] = []
  terminated = false
  postMessage(message: unknown): void {
    this.messages.push(message)
  }
  terminate(): void {
    this.terminated = true
  }
  answer(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
  fail(message: string): void {
    const event = new Event('error')
    Object.defineProperty(event, 'message', { value: message })
    this.dispatchEvent(event)
  }
}

const options = { nodes: 1, chunkNodes: 2, timeoutMs: 1_000, yieldWork: () => Promise.resolve() }

describe('sceneDocumentCodec', () => {
  it('keeps small scenes on the calling thread', async () => {
    const worker = new CodecWorker()
    const codec = createSceneDocumentCodec(() => worker as unknown as Worker, {
      ...options,
      nodes: 100,
    })
    const encoded = await codec.encode(createDefaultScene(), 'scene-1')
    expect(JSON.parse(encoded)).toMatchObject({ asset: { version: '2.0' } })
    expect(worker.messages).toEqual([])
  })

  it('sends bounded chunks, assembles exact bytes, and keeps saves FIFO', async () => {
    const worker = new CodecWorker()
    const codec = createSceneDocumentCodec(() => worker as unknown as Worker, {
      ...options,
      nodes: 5,
    })
    const state = {
      ...createDefaultScene(),
      nodes: Array.from({ length: 5 }, (_, at) => meshNode(`mesh-${at}`)),
    }
    const first = codec.encode(state, 'scene-1')
    const second = codec.encode(createDefaultScene(), 'scene-1')
    await new Promise(resolve => setTimeout(resolve, 0))
    const messages = worker.messages as Array<{ id: number; operation: string; nodes?: unknown[] }>
    expect(new Set(messages.map(message => message.id))).toEqual(new Set([1]))
    expect(messages.filter(message => message.operation === 'encodeNodes')).toHaveLength(3)
    expect(messages.flatMap(message => message.nodes ?? []).length).toBe(5)
    expect(messages.every(message => (message.nodes?.length ?? 0) <= 2)).toBe(true)
    worker.answer({ id: 1, done: false, index: 0, content: '{"first":' })
    worker.answer({ id: 1, done: false, index: 1, content: 'true}' })
    worker.answer({ id: 1, done: true, ok: true, chunks: 2, characters: 14 })
    await expect(first).resolves.toBe('{"first":true}')
    await expect(second).resolves.toEqual(expect.stringContaining('"version":"2.0"'))
    expect(worker.messages.some(message => JSON.stringify(message).includes('"id":2'))).toBe(false)
  })

  it('writes here rather than assemble an out-of-order answer', async () => {
    const worker = new CodecWorker()
    const codec = createSceneDocumentCodec(() => worker as unknown as Worker, options)
    const encoding = codec.encode({ ...createDefaultScene(), nodes: [meshNode('one')] }, 'scene-1')
    await Promise.resolve()
    worker.answer({ id: 1, done: false, index: 1, content: 'skipped zero' })

    const written = await encoding
    expect(written).not.toContain('skipped zero')
    expect(written).toContain('"version":"2.0"')
  })

  it('writes here rather than keep a worker file that came back short', async () => {
    const worker = new CodecWorker()
    const codec = createSceneDocumentCodec(() => worker as unknown as Worker, options)
    const encoding = codec.encode({ ...createDefaultScene(), nodes: [meshNode('one')] }, 'scene-1')
    await Promise.resolve()
    worker.answer({ id: 1, done: false, index: 0, content: '{"cut"' })
    worker.answer({ id: 1, done: true, ok: true, chunks: 2, characters: 12 })

    const written = await encoding
    expect(written).not.toBe('{"cut"')
    expect(written).toContain('"version":"2.0"')
  })

  it('cancels an active encoding when its document incarnation ends', async () => {
    const worker = new CodecWorker()
    const codec = createSceneDocumentCodec(() => worker as unknown as Worker, options)
    const controller = new AbortController()
    const encoding = codec.encode(
      { ...createDefaultScene(), nodes: [meshNode('one')] },
      'scene-1',
      controller.signal,
    )
    await Promise.resolve()

    controller.abort()

    await expect(encoding).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.messages.some(message => JSON.stringify(message).includes('"cancel":true'))).toBe(
      true,
    )
  })

  it('writes here after a worker crash, and restarts for the next save', async () => {
    const workers: CodecWorker[] = []
    const codec = createSceneDocumentCodec(() => {
      const worker = new CodecWorker()
      workers.push(worker)
      return worker as unknown as Worker
    }, options)
    const state = { ...createDefaultScene(), nodes: [meshNode('one')] }
    const failed = codec.encode(state, 'scene-1')
    await Promise.resolve()
    workers[0]?.fail('driver stopped')
    expect(await failed).toContain('"version":"2.0"')
    const retried = codec.encode(state, 'scene-1')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(workers).toHaveLength(2)
    workers[1]?.answer({ id: 2, done: false, index: 0, content: '{"ok":true}' })
    workers[1]?.answer({ id: 2, done: true, ok: true, chunks: 1, characters: 11 })
    await expect(retried).resolves.toBe('{"ok":true}')
  })

  it('fails only its own request on a timeout, leaving other saves in flight alone', async () => {
    const workers: CodecWorker[] = []
    const codec = createSceneDocumentCodec(
      () => {
        const worker = new CodecWorker()
        workers.push(worker)
        return worker as unknown as Worker
      },
      { ...options, timeoutMs: 5 },
    )
    const state = { ...createDefaultScene(), nodes: [meshNode('one')] }

    const slow = codec.encode(state, 'scene-1')
    const other = codec.encode(state, 'scene-2')
    await new Promise(resolve => setTimeout(resolve, 0))

    // Answered inside its own deadline, while the first is left to run out.
    workers[0]?.answer({ id: 2, done: false, index: 0, content: '{"ok":true}' })
    workers[0]?.answer({ id: 2, done: true, ok: true, chunks: 1, characters: 11 })
    await expect(other).resolves.toBe('{"ok":true}')

    expect(await slow).toContain('"version":"2.0"')
    // The document that ran out did not take the worker, nor anybody else's save, with it.
    expect(workers).toHaveLength(1)
    expect(workers[0]?.terminated).toBe(false)
  })

  it('terminates a worker that rejects a later input chunk, and writes here instead', async () => {
    class RejectingWorker extends CodecWorker {
      override postMessage(message: unknown): void {
        super.postMessage(message)
        if (this.messages.length === 2) throw new Error('cannot clone chunk')
      }
    }
    const failedWorker = new RejectingWorker()
    const replacement = new CodecWorker()
    const workers = [failedWorker, replacement]
    const codec = createSceneDocumentCodec(() => workers.shift() as unknown as Worker, options)
    const state = { ...createDefaultScene(), nodes: [meshNode('one')] }

    expect(await codec.encode(state, 'scene-1')).toContain('"version":"2.0"')
    expect(failedWorker.terminated).toBe(true)
    const retried = codec.encode(state, 'scene-1')
    await new Promise(resolve => setTimeout(resolve, 0))
    replacement.answer({ id: 2, done: false, index: 0, content: '{"ok":true}' })
    replacement.answer({ id: 2, done: true, ok: true, chunks: 1, characters: 11 })
    await expect(retried).resolves.toBe('{"ok":true}')
  })

  it('does not restart queued work after disposal', async () => {
    const workers: CodecWorker[] = []
    const codec = createSceneDocumentCodec(() => {
      const worker = new CodecWorker()
      workers.push(worker)
      return worker as unknown as Worker
    }, options)
    const state = { ...createDefaultScene(), nodes: [meshNode('one')] }
    const active = codec.encode(state, 'scene-1')
    const queued = codec.encode(state, 'scene-1')
    await Promise.resolve()

    codec.dispose()

    await expect(active).rejects.toMatchObject({ name: 'AbortError' })
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers).toHaveLength(1)
  })

  /**
   * Holds the worker's own serializer against the synchronous one, across the split and the two
   * structured clones the protocol adds. Blind to the worker's message handling around it.
   */
  it('writes the same file whether the nodes crossed a worker or not', () => {
    const state = { ...createDefaultScene(), nodes: meshNodesOf(1_100) }

    const { nodes, ...rest } = state
    const carried = structuredClone(rest)
    const gathered: SceneNode[] = []
    for (let at = 0; at < nodes.length; at += 512) {
      gathered.push(...structuredClone(nodes.slice(at, at + 512)))
    }

    expect(sceneDocumentText(carried, gathered, 'scene-1')).toBe(
      JSON.stringify(scenePayloadOf(state, 'scene-1')),
    )
  })
})

function meshNodesOf(count: number): SceneNode[] {
  return Array.from({ length: count }, (_unused, index) => meshNode(`mesh-${index}`))
}

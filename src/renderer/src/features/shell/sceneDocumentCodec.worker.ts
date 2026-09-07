/// <reference lib="webworker" />
import { breathe } from '@/engines/core/breathe'
import type { SceneNode } from '@/engines/scene/sceneState'
import { messageOf } from '@shared/guards'
import {
  isSceneDocumentCancel,
  type SceneDocumentCodecRequest,
  type SceneDocumentCodecResponse,
  type SceneDocumentState,
} from './sceneDocumentCodecMessage'
import { sceneDocumentText } from './sceneDocumentText'
import { yieldSceneDocument } from './sceneDocumentYield'

declare const self: DedicatedWorkerGlobalScope

type Encoding = {
  state: SceneDocumentState
  documentId: string
  nodes: SceneNode[]
  nextIndex: number
}

const CONTENT_CHUNK_CHARACTERS = 1_048_576
const encoding = new Map<number, Encoding>()
const cancelled = new Set<number>()
const active = new Set<number>()

self.addEventListener('message', (event: MessageEvent<SceneDocumentCodecRequest>) => {
  if (isSceneDocumentCancel(event.data)) {
    encoding.delete(event.data.id)
    if (active.has(event.data.id)) cancelled.add(event.data.id)
    return
  }
  void accept(event.data)
})

async function accept(
  request: Exclude<SceneDocumentCodecRequest, { cancel: true }>,
): Promise<void> {
  try {
    if (request.operation === 'encodeStart') {
      encoding.set(request.id, {
        state: request.state,
        documentId: request.documentId,
        nodes: [],
        nextIndex: 0,
      })
      return
    }
    await finishEncode(request.id, request.index, request.nodes, request.done)
  } catch (error) {
    post({ id: request.id, done: true, ok: false, error: messageOf(error) })
  }
}

async function finishEncode(
  id: number,
  index: number,
  nodes: readonly SceneNode[],
  done: boolean,
): Promise<void> {
  const pending = encoding.get(id)
  if (!pending || cancelled.delete(id)) return
  if (index !== pending.nextIndex) {
    encoding.delete(id)
    throw new Error(`scene document worker expected chunk ${pending.nextIndex}, received ${index}`)
  }
  pending.nextIndex += 1
  pending.nodes.push(...nodes)
  if (!done) return
  encoding.delete(id)
  const content = sceneDocumentText(pending.state, pending.nodes, pending.documentId)
  active.add(id)
  try {
    let contentIndex = 0
    for (let at = 0; at < content.length; at += CONTENT_CHUNK_CHARACTERS) {
      if (cancelled.has(id)) return
      post({
        id,
        done: false,
        index: contentIndex,
        content: content.slice(at, at + CONTENT_CHUNK_CHARACTERS),
      })
      contentIndex += 1
      await (contentIndex % 8 === 0 ? breathe() : yieldSceneDocument())
    }
    post({ id, done: true, ok: true, chunks: contentIndex, characters: content.length })
  } finally {
    active.delete(id)
    cancelled.delete(id)
  }
}

function post(response: SceneDocumentCodecResponse): void {
  self.postMessage(response)
}

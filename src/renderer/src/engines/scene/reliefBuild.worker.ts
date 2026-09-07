/// <reference lib="webworker" />
import { messageOf } from '@shared/guards'
import { chunkCountAlong, chunkLayout } from '@shared/domain/relief'
import { reliefGeometryData } from './reliefSurface'
import {
  isReliefBuildCancel,
  type ReliefBuildIncoming,
  type ReliefBuildResponse,
} from './reliefBuildMessage'
import { breathe } from '../core/breathe'
import { createCancelRegistry } from '../core/cancelRegistry'

declare const self: DedicatedWorkerGlobalScope

const cancels = createCancelRegistry()

self.addEventListener('message', (event: MessageEvent<ReliefBuildIncoming>) => {
  if (isReliefBuildCancel(event.data)) {
    cancels.cancel(event.data.id)
    return
  }
  cancels.start(event.data.id)
  void build(event.data)
})

async function build(request: Exclude<ReliefBuildIncoming, { cancel: true }>): Promise<void> {
  try {
    const samples = { width: request.width, height: request.height, values: request.values }
    const columns = chunkCountAlong(request.width, request.grain)
    const rows = chunkCountAlong(request.height, request.grain)
    const chunks = []

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (cancels.stopped(request.id)) return
        chunks.push(
          reliefGeometryData(
            samples,
            request.extent,
            chunkLayout(column, row, request.width, request.height, request.grain),
            request.grain,
            request.edits,
          ),
        )
      }
      post({ id: request.id, done: false, progress: (row + 1) / rows })
      await breathe()
    }

    if (cancels.stopped(request.id)) return
    const transfer = chunks.flatMap(chunk => [
      chunk.position.buffer,
      chunk.normal.buffer,
      chunk.uv.buffer,
      chunk.index.buffer,
    ])
    self.postMessage(
      { id: request.id, done: true, ok: true, chunks } satisfies ReliefBuildResponse,
      {
        transfer,
      },
    )
  } catch (error) {
    post({ id: request.id, done: true, ok: false, error: messageOf(error) })
  } finally {
    cancels.finish(request.id)
  }
}

function post(response: ReliefBuildResponse): void {
  self.postMessage(response)
}

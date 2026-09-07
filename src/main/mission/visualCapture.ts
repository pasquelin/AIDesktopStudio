import { randomUUID } from 'node:crypto'
import type { AssistantVisualCaptureRequest } from '@shared/ipcEvents'
import { probePng } from '@main/media/png'
import { isRecord } from '@shared/guards'
import type { VisualContext } from './context'

const MAX_CAPTURE_BYTES = 8_000_000

export type VisualCapturePort = {
  capture: (documentId: string, revision?: number) => Promise<VisualContext | null>
  settle: (result: unknown) => void
}

type VisualCaptureDeps = {
  send: (request: AssistantVisualCaptureRequest) => boolean
  now: () => string
  newId?: () => string
  timeoutMs?: number
}

export function createVisualCapturePort({
  send,
  now,
  newId = randomUUID,
  timeoutMs = 5_000,
}: VisualCaptureDeps): VisualCapturePort {
  const waiting = new Map<string, (png: Uint8Array | null) => void>()
  return {
    capture: (documentId, revision) =>
      new Promise(resolve => {
        const callId = newId()
        if (!send({ callId, documentId })) return resolve(null)
        const timer = setTimeout(() => {
          waiting.delete(callId)
          resolve(null)
        }, timeoutMs)
        timer.unref()
        waiting.set(callId, png => {
          clearTimeout(timer)
          const accepted = png && png.byteLength <= MAX_CAPTURE_BYTES ? png : null
          const dimensions = accepted ? probePng(accepted) : null
          resolve(
            accepted && dimensions?.width && dimensions.height
              ? {
                  kind: 'document',
                  mimeType: 'image/png',
                  width: dimensions.width,
                  height: dimensions.height,
                  bytes: accepted,
                  capturedAt: now(),
                  resourceId: documentId,
                  ...(revision === undefined ? {} : { revision }),
                }
              : null,
          )
        })
      }),
    settle: result => {
      if (!isRecord(result) || typeof result['callId'] !== 'string') return
      const callId = result['callId']
      const value = result['png']
      if (value !== null && !(value instanceof Uint8Array)) return
      const answer = waiting.get(callId)
      if (!answer) return
      waiting.delete(callId)
      answer(value)
    },
  }
}

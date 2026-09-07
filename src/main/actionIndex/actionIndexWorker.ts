import { parentPort, workerData } from 'node:worker_threads'
import { isRecord, messageOf } from '@shared/guards'
import { openNativeDatabase } from '@main/project/sqliteNative'
import { createActionIndex } from './actionIndex'
import { dispatchActionIndex } from './actionIndexDispatch'
import type { ActionIndexRequest } from './actionIndexProtocol'

type Started = { database: string }
const isStarted = (value: unknown): value is Started =>
  isRecord(value) && typeof value.database === 'string'
const port = parentPort
if (!port) throw new Error('action index worker started without a parent port')
if (!isStarted(workerData)) throw new Error('action index worker started without its database')

try {
  const index = createActionIndex(openNativeDatabase(workerData.database))
  port.on('message', (request: ActionIndexRequest) => {
    try {
      port.postMessage({ id: request.id, ok: true, value: dispatchActionIndex(index, request) })
    } catch (error) {
      port.postMessage({ id: request.id, ok: false, error: messageOf(error) })
    }
  })
  port.postMessage({ ready: true })
} catch (error) {
  port.postMessage({ ready: false, error: messageOf(error) })
}

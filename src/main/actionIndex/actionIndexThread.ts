import { Worker } from 'node:worker_threads'
import { threadReady } from '@main/threadReady'
import { actionCorpus } from './actionCorpus'
import {
  createActionIndexClient,
  type ActionIndexPort,
  type AsyncActionIndex,
} from './actionIndexClient'
import { isActionIndexReady, type ActionIndexResponse } from './actionIndexProtocol'

export async function openActionIndexThread(database: string): Promise<AsyncActionIndex> {
  const worker = new Worker(new URL('./actionIndexWorker.js', import.meta.url), {
    workerData: { database },
  })
  await threadReady(worker, 'action index', isActionIndexReady)
  const port: ActionIndexPort = {
    postMessage: request => worker.postMessage(request),
    onMessage: listener =>
      worker.on('message', (message: ActionIndexResponse) => {
        if (!isActionIndexReady(message)) listener(message)
      }),
    onFailure: listener => {
      worker.on('error', listener)
      worker.on('exit', code => {
        if (code !== 0) listener(new Error(`action index thread exited with code ${code}`))
      })
    },
    terminate: async () => {
      await worker.terminate()
    },
  }
  const index = createActionIndexClient(port)
  await index.rebuild(actionCorpus())
  return index
}

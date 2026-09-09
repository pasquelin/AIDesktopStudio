import { localizedError } from '@shared/localizedError'
import type { TaskWatch } from '@shared/domain/taskProgress'
import { createProcessClient } from '@main/processClient'
import type { BundleMessage, BundleReadJob, BundleResponse, BundleWriteJob } from './bundleProtocol'
import type { OtiozRead } from './otiozRead'

/** The worker, reduced to what the client needs — injected, since `fork` needs a live app. */
export type BundlePort = {
  postMessage: (message: BundleMessage) => void
  onMessage: (listener: (response: BundleResponse) => void) => void
  /** The process died. Whatever it was asked will never be answered. */
  onFailure: (listener: (error: Error) => void) => void
}

/** Packs a montage and its rushes into one archive, and unpacks one, off this process entirely. */
export type BundleClient = {
  /** Answers whether the bundle was written — `false` when it was stopped. */
  write: (run: Omit<BundleWriteJob, 'writes'> & TaskWatch) => Promise<boolean>
  /** Answers the cut and where each medium landed — `null` when it was stopped. */
  read: (run: Omit<BundleReadJob, 'writes'> & TaskWatch) => Promise<OtiozRead | null>
}

/** Either direction's answer. The worker says `wrote` to a write and `read` to a read. */
type Settled = boolean | OtiozRead | null

export function createBundleClient(port: BundlePort): BundleClient {
  const client = createProcessClient<BundleMessage, BundleResponse, Settled>({
    port,
    runOf: response => response.id,
    read: response => {
      if (response.kind === 'progress') {
        return { kind: 'progress', done: response.done, total: response.total }
      }
      if (response.kind === 'wrote') return { kind: 'settled', result: response.written }
      if (response.kind === 'read') return { kind: 'settled', result: response.contents }
      return { kind: 'failed', error: response.error }
    },
    gone: localizedError('bundleProcessStopped').message,
    cancel: id => ({ id, cancel: true }),
    // A stopped write maps null to false; a stopped read keeps null.
    stopped: () => null,
  })

  return {
    write: async ({ onStep, signal, ...job }) =>
      (await client.send(id => ({ id, writes: true, ...job }), { onStep, signal })) === true,
    // The worker pairs read requests with read responses across the untyped process boundary.
    read: ({ onStep, signal, ...job }) =>
      client.send(id => ({ id, writes: false, ...job }), {
        onStep,
        signal,
      }) as Promise<OtiozRead | null>,
  }
}

import { localizedError } from '@shared/localizedError'
import { describe, expect, it } from 'vitest'
import { createBundleClient, type BundlePort } from './bundleClient'
import type { BundleMessage, BundleResponse } from './bundleProtocol'

/** The worker, replaced by a list of what was said to it and a way to answer. */
function fakePort(): BundlePort & {
  posted: BundleMessage[]
  answer: (response: BundleResponse) => void
  die: (error: Error) => void
} {
  const posted: BundleMessage[] = []
  let onMessage: (response: BundleResponse) => void = () => {}
  let onFailure: (error: Error) => void = () => {}

  return {
    posted,
    postMessage: message => void posted.push(message),
    onMessage: listener => void (onMessage = listener),
    onFailure: listener => void (onFailure = listener),
    answer: response => onMessage(response),
    die: error => onFailure(error),
  }
}

const JOB = { path: '/tmp/Bande.otioz', content: '{}', media: [] }

describe('the bundle client', () => {
  it('answers written once the worker says the archive is on disk', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const writing = client.write(JOB)
    port.answer({ id: 1, kind: 'wrote', written: true })

    await expect(writing).resolves.toBe(true)
  })

  it('relays every step to the run that asked for it, and to no other', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const mine: number[] = []
    const theirs: number[] = []
    const first = client.write({ ...JOB, onStep: done => mine.push(done) })
    const second = client.write({ ...JOB, onStep: done => theirs.push(done) })

    port.answer({ id: 1, kind: 'progress', done: 512, total: 2048 })
    port.answer({ id: 2, kind: 'progress', done: 8, total: 8 })
    port.answer({ id: 1, kind: 'wrote', written: true })
    port.answer({ id: 2, kind: 'wrote', written: true })

    await Promise.all([first, second])
    expect(mine).toEqual([512])
    expect(theirs).toEqual([8])
  })

  /** Stopped is a decision, not a fault: the caller answers nothing rather than reporting one. */
  it('answers not-written for a bundle the worker says it stopped', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const writing = client.write(JOB)
    port.answer({ id: 1, kind: 'wrote', written: false })

    await expect(writing).resolves.toBe(false)
  })

  it('asks the worker to stop when the run is aborted, rather than dropping it here', async () => {
    const port = fakePort()
    const client = createBundleClient(port)
    const controller = new AbortController()

    const writing = client.write({ ...JOB, signal: controller.signal })
    controller.abort()

    expect(port.posted.at(-1)).toEqual({ id: 1, cancel: true })

    // Still the worker's answer that settles it: it is the side holding the half-written file.
    port.answer({ id: 1, kind: 'wrote', written: false })
    await expect(writing).resolves.toBe(false)
  })

  it('never posts a bundle that was stopped before it started', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    await expect(client.write({ ...JOB, signal: AbortSignal.abort() })).resolves.toBe(false)
    expect(port.posted).toEqual([])
  })

  it('carries the wording of the worker back, so the missing rush is named', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const writing = client.write(JOB)
    port.answer({ id: 1, kind: 'failed', error: 'this montage points at a file that is not there' })

    await expect(writing).rejects.toThrow('this montage points at a file that is not there')
  })

  /**
   * A dead process swallows `postMessage` without a word: without this, a row would turn in the
   * status line for the rest of the session, and the next bundle would join it.
   */
  it('fails everything waiting when the process dies, and refuses what comes after', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const writing = client.write(JOB)
    port.die(new Error('bundle process exited with code 1'))

    await expect(writing).rejects.toThrow('exited with code 1')
    await expect(client.write(JOB)).rejects.toThrow(localizedError('bundleProcessStopped').message)
  })
})

/** The direction this lot added, and the one the suite covered nowhere. */
describe('the bundle client, reading one back', () => {
  const READ = { path: '/tmp/Bande.otioz', into: '/tmp/unpacked' }

  it('answers the contents the worker unpacked', async () => {
    const port = fakePort()
    const client = createBundleClient(port)
    const contents = { content: '{"OTIO_SCHEMA":"Timeline.1"}', media: [] }

    const reading = client.read(READ)
    port.answer({ id: 1, kind: 'read', contents })

    await expect(reading).resolves.toEqual(contents)
  })

  /** `false` is the write's answer for a stop; a read that borrowed it would be a cut of `false`. */
  it('answers nothing rather than not-written for a read that was stopped', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const reading = client.read(READ)
    port.answer({ id: 1, kind: 'read', contents: null })

    await expect(reading).resolves.toBeNull()
  })

  it('never posts a read that was stopped before it started, and answers nothing', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    await expect(client.read({ ...READ, signal: AbortSignal.abort() })).resolves.toBeNull()
    expect(port.posted).toEqual([])
  })

  it('relays the steps of a read to the run that asked for it', async () => {
    const port = fakePort()
    const client = createBundleClient(port)

    const seen: number[] = []
    const reading = client.read({ ...READ, onStep: done => seen.push(done) })
    port.answer({ id: 1, kind: 'progress', done: 1024, total: 4096 })
    port.answer({ id: 1, kind: 'read', contents: null })

    await reading
    expect(seen).toEqual([1024])
  })
})

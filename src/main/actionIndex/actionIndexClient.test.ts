import { describe, expect, it } from 'vitest'
import { actionCorpus } from './actionCorpus'
import { createActionIndexClient, type ActionIndexPort } from './actionIndexClient'
import type { ActionIndexRequest, ActionIndexResponse } from './actionIndexProtocol'

function fakePort() {
  let answer: ((response: ActionIndexResponse) => void) | undefined
  const sent: ActionIndexRequest[] = []
  let terminated = false
  const port: ActionIndexPort = {
    postMessage: request => sent.push(request),
    onMessage: listener => {
      answer = listener
    },
    onFailure: () => undefined,
    terminate: async () => {
      terminated = true
    },
  }
  return {
    port,
    sent,
    answer: (response: ActionIndexResponse) => answer?.(response),
    terminated: () => terminated,
  }
}

describe('ActionIndex client', () => {
  it('pairs a typed search response with its request', async () => {
    const fake = fakePort()
    const client = createActionIndexClient(fake.port)
    const pending = client.search({ query: 'project' })
    expect(fake.sent[0]).toMatchObject({ id: 1, op: 'search' })
    fake.answer({ id: 1, ok: true, value: [] })
    await expect(pending).resolves.toEqual([])
  })

  it('waits for close acknowledgement before terminating its worker', async () => {
    const fake = fakePort()
    const client = createActionIndexClient(fake.port)
    const pending = client.close()
    expect(fake.terminated()).toBe(false)
    expect(fake.sent[0]).toEqual({ id: 1, op: 'close' })
    fake.answer({ id: 1, ok: true, value: undefined })
    await pending
    expect(fake.terminated()).toBe(true)
  })

  it('sends the generated corpus rather than another action list', async () => {
    const fake = fakePort()
    const client = createActionIndexClient(fake.port)
    const corpus = actionCorpus()
    const pending = client.rebuild(corpus)
    fake.answer({
      id: 1,
      ok: true,
      value: { rebuilt: true, count: corpus.actions.length, fingerprint: corpus.fingerprint },
    })
    await expect(pending).resolves.toMatchObject({ rebuilt: true, count: 305 })
    expect(fake.sent[0]).toMatchObject({ op: 'rebuild', corpus })
  })
})

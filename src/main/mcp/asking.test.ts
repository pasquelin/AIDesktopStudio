import { describe, expect, it, vi } from 'vitest'
import type { ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import type { AssistantActionRequest } from '@shared/ipc'
import { createRemoteActions } from './asking'

const call: AssistantCall = { action: 'workspace.open', input: { workspace: '3d' } }

/** The short wait, quoted rather than imported: `asking.ts` keeps it to itself. */
const READ_WAIT_MS = 2_000

/** A window that always takes the request, and hands back what it was asked under. */
function windowThatAnswers() {
  const sent: AssistantActionRequest[] = []
  const actions = createRemoteActions({
    send: request => {
      sent.push(request)
      return true
    },
    newCallId: () => `call_${sent.length + 1}`,
  })

  return { actions, sent }
}

describe('asking the window in front to act', () => {
  it('serves bounded action discovery in the main process', async () => {
    const findActions = vi.fn(async (): Promise<ActionOutcome> => ({
      ok: true,
      data: [{ name: 'git.checkout' }],
    }))
    const send = vi.fn(() => true)
    const actions = createRemoteActions({ send, findActions })

    await expect(
      actions.run({ action: 'actions.find', input: { query: 'switch branch' } }),
    ).resolves.toEqual({ ok: true, data: [{ name: 'git.checkout' }] })
    expect(findActions).toHaveBeenCalledWith('switch branch')
    expect(send).not.toHaveBeenCalled()
  })

  it('answers what the window made of it', async () => {
    const { actions } = windowThatAnswers()
    const running = actions.run(call)

    actions.settle({ callId: 'call_1', outcome: { ok: true, data: { opened: true } } })

    await expect(running).resolves.toEqual({ ok: true, data: { opened: true } })
  })

  /**
   * The answer an MCP client gets when the application is minimised with nothing in front.
   * Refused rather than queued: a costly action has nowhere to show its question, and holding
   * it until a window appears would spend on a screen nobody was watching.
   */
  it('refuses outright when there is no window to ask', async () => {
    const actions = createRemoteActions({ send: () => false })

    await expect(actions.run(call)).resolves.toEqual({ ok: false, refusal: 'noWindow' })
  })

  it('gives up after its own wait rather than leaving the caller hanging', async () => {
    const actions = createRemoteActions({ send: () => true, timeoutMs: 1 })

    await expect(actions.run(call)).resolves.toEqual({ ok: false, refusal: 'timedOut' })
  })

  /**
   * 🛑 Derived from what the call ENGAGES, not from who is calling. The assistant's state read
   * sits in front of every sentence typed, and a `documents.list` from an MCP client hits a
   * window that may be reloading — neither raises a question, so neither waits two minutes for
   * a person to read one.
   */
  it('waits far less for a call that asks nobody', async () => {
    const actions = createRemoteActions({ send: () => true })
    const started = Date.now()

    // `documents.list` commits nothing, so the cap is the read one and not the two minutes.
    await expect(actions.run({ action: 'documents.list', input: {} })).resolves.toEqual({
      ok: false,
      refusal: 'timedOut',
    })
    expect(Date.now() - started).toBeLessThan(10_000)
  }, 15_000)

  /**
   * 🛑 A lot engages nothing OF ITS OWN and carries up to fifty calls that each may. On the two
   * seconds a reading call gets, the client was answered `timedOut` while the lot still ran.
   */
  it('gives a lot the long wait, though the lot itself engages nothing', async () => {
    vi.useFakeTimers()
    const actions = createRemoteActions({ send: () => true })
    const lot = actions.run({ action: 'studio.batch', input: { calls: '[]' } })

    await vi.advanceTimersByTimeAsync(READ_WAIT_MS * 2)
    await expect(Promise.race([lot, Promise.resolve('still waiting')])).resolves.toBe(
      'still waiting',
    )

    await vi.advanceTimersByTimeAsync(120_000)
    await expect(lot).resolves.toEqual({ ok: false, refusal: 'timedOut' })
    vi.useRealTimers()
  })

  // An answer that arrives after the wait ended, or a window answering twice.
  it('drops an answer nobody is waiting on', () => {
    const { actions } = windowThatAnswers()

    expect(() => actions.settle({ callId: 'call_9', outcome: { ok: true } })).not.toThrow()
  })

  it('keeps two calls apart', async () => {
    const { actions } = windowThatAnswers()
    const first = actions.run(call)
    const second = actions.run(call)

    actions.settle({ callId: 'call_2', outcome: { ok: false, refusal: 'declined' } })
    actions.settle({ callId: 'call_1', outcome: { ok: true } })

    await expect(first).resolves.toEqual({ ok: true })
    await expect(second).resolves.toEqual({ ok: false, refusal: 'declined' })
  })

  it('sends the call as it was given, under an id of its own', () => {
    const { actions, sent } = windowThatAnswers()
    void actions.run(call)

    expect(sent).toEqual([{ callId: 'call_1', call }])
  })
})

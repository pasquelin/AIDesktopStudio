import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionName, ActionOutcome } from '@shared/domain/assistant'
import type { AssistantActionRequest, AssistantActionResult } from '@shared/ipc'
import type { AssistantVisualCaptureRequest, AssistantVisualCaptureResult } from '@shared/ipcEvents'
import { installFakeBridge } from '@/services/fakeBridge'
import { connectRemoteActions } from './remoteActions'

/**
 * The executor stands in: what each action does is its own suite's business. What this one is
 * about is that an action asked for from outside meets the SAME gate the modal uses, and that
 * an answer always goes back.
 */
const runConfirmedAction = vi.hoisted(() =>
  vi.fn<(name: ActionName, input: Record<string, unknown>) => Promise<ActionOutcome>>(),
)
vi.mock('./executor', () => ({ runConfirmedAction }))
const captureStill = vi.hoisted(() => vi.fn<() => Promise<Uint8Array>>())
const flatten = vi.hoisted(() => vi.fn<() => Promise<Uint8Array | null>>())
const sceneEngineOf = vi.hoisted(() =>
  vi.fn<() => { captureStill: typeof captureStill } | null>(() => null),
)
const canvasHost = vi.hoisted(() => vi.fn(() => ({ flatten })))
vi.mock('@/stores/sceneEngines', () => ({ sceneEngineOf }))
vi.mock('@/features/image/canvasHosts', () => ({ canvasHost }))

/** A bridge that hands back the way to push an action, and what the window answered. */
function connected() {
  let push: ((request: AssistantActionRequest) => void) | null = null
  let pushVisual: ((request: AssistantVisualCaptureRequest) => void) | null = null
  const answers: AssistantActionResult[] = []
  const visuals: AssistantVisualCaptureResult[] = []

  installFakeBridge({
    assistant: {
      onAction: (callback: (request: AssistantActionRequest) => void) => {
        push = callback
        return () => {}
      },
      actionResult: (result: AssistantActionResult) => {
        answers.push(result)
        return Promise.resolve()
      },
      onVisualCapture: callback => {
        pushVisual = callback
        return () => {}
      },
      visualCaptureResult: result => {
        visuals.push(result)
        return Promise.resolve()
      },
    },
  })

  const stop = connectRemoteActions()
  return {
    push: (request: AssistantActionRequest) => push?.(request),
    pushVisual: (request: AssistantVisualCaptureRequest) => pushVisual?.(request),
    answers,
    visuals,
    stop,
  }
}

beforeEach(() => {
  runConfirmedAction.mockReset()
  runConfirmedAction.mockResolvedValue({ ok: true })
  captureStill.mockReset()
  flatten.mockReset()
  sceneEngineOf.mockReset()
  sceneEngineOf.mockReturnValue(null)
  canvasHost.mockClear()
})

describe('an ephemeral visual requested from outside the window', () => {
  it('captures a scene without creating an asset', async () => {
    const png = new Uint8Array([1, 2, 3])
    captureStill.mockResolvedValue(png)
    sceneEngineOf.mockReturnValue({ captureStill })
    const { pushVisual, visuals } = connected()

    pushVisual({ callId: 'capture_1', documentId: 'scene_1' })
    await vi.waitFor(() => expect(visuals).toHaveLength(1))

    expect(captureStill).toHaveBeenCalledWith('view')
    expect(canvasHost).not.toHaveBeenCalled()
    expect(visuals[0]).toEqual({ callId: 'capture_1', png })
  })

  it('answers with no image when a canvas capture fails', async () => {
    flatten.mockRejectedValue(new Error('canvas unavailable'))
    const { pushVisual, visuals } = connected()

    pushVisual({ callId: 'capture_2', documentId: 'image_1' })
    await vi.waitFor(() => expect(visuals).toHaveLength(1))

    expect(visuals[0]).toEqual({ callId: 'capture_2', png: null })
  })
})

describe('an action asked for from outside the window', () => {
  it('goes through the same gate as one the modal decided on', async () => {
    const { push, answers } = connected()
    push({ callId: 'call_1', call: { action: 'workspace.open', input: { workspace: '3d' } } })
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    // The third argument is what says the call came from the wire — see `wireConsent`.
    expect(runConfirmedAction).toHaveBeenCalledWith('workspace.open', { workspace: '3d' }, {})
    expect(answers[0]).toEqual({ callId: 'call_1', outcome: { ok: true } })
  })

  it('hands the gate the token a client carried, apart from what the action reads', async () => {
    const { push, answers } = connected()
    push({
      callId: 'call_2',
      call: { action: 'document.save', input: { documentId: 'd1', consent: 'tok-9' } },
    })
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    expect(runConfirmedAction).toHaveBeenCalledWith(
      'document.save',
      { documentId: 'd1' },
      { consent: 'tok-9' },
    )
  })

  it('answers under the id it was asked, refusal and all', async () => {
    runConfirmedAction.mockResolvedValue({ ok: false, refusal: 'declined' })
    const { push, answers } = connected()
    push({ callId: 'call_7', call: { action: 'generator.submit', input: {} } })
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    expect(answers[0]).toMatchObject({
      callId: 'call_7',
      outcome: { ok: false, refusal: 'declined' },
    })
  })

  /**
   * The name crossed a boundary, so the compiler cannot vouch for it here — and on the other
   * end somebody waits two minutes for an answer that would otherwise never come.
   */
  it('answers rather than acting when the name is not one the registry declares', async () => {
    const { push, answers } = connected()
    // Cast because the boundary type says `ActionName` and this test is about what happens when
    // the runtime value is not one — which is exactly what the compiler cannot express here.
    push({ callId: 'call_2', call: { action: 'command.fly' as ActionName, input: {} } })
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    expect(runConfirmedAction).not.toHaveBeenCalled()
    expect(answers[0]?.outcome).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  it('answers rather than going quiet when the action itself threw', async () => {
    runConfirmedAction.mockRejectedValue(new Error('the panel is gone'))
    const { push, answers } = connected()
    push({ callId: 'call_3', call: { action: 'jobs.list', input: {} } })
    await vi.waitFor(() => expect(answers).toHaveLength(1))

    expect(answers[0]?.outcome).toMatchObject({ ok: false, refusal: 'failed' })
  })
})

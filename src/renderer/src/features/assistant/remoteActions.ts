import { assistantAction } from '@shared/domain/assistant'
import type { ActionOutcome } from '@shared/domain/assistant'
import { getBridge } from '@/services/bridge'
import { splitConsent } from './wireConsent'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { canvasHost } from '@/features/image/canvasHosts'

/**
 * Actions asked for from OUTSIDE this window — today, by an MCP client.
 *
 * They land on exactly the same gate as the ones the conversation decides on: `runConfirmedAction`.
 * That is the whole point of the arrangement — a generation asked for from the other side of
 * the machine raises the same question on this screen, with the same figure, and spends nothing
 * until somebody says yes.
 *
 * Every window subscribes; only the one in front is ever sent anything.
 */
export function connectRemoteActions(): () => void {
  const bridge = getBridge()
  if (!bridge) return () => {}

  const stopActions = bridge.assistant.onAction(({ callId, call }) => {
    void answer(callId, call.action, call.input)
  })
  const stopVisual = bridge.assistant.onVisualCapture(({ callId, documentId }) => {
    void answerVisual(callId, documentId)
  })
  return () => {
    stopActions()
    stopVisual()
  }
}

async function answerVisual(callId: string, documentId: string): Promise<void> {
  const png = await captureVisual(documentId)
  await getBridge()?.assistant.visualCaptureResult({ callId, png })
}

async function captureVisual(documentId: string): Promise<Uint8Array | null> {
  try {
    const scene = sceneEngineOf(documentId)
    return scene
      ? await scene.captureStill('view')
      : ((await canvasHost(documentId)?.flatten()) ?? null)
  } catch {
    return null
  }
}

async function answer(
  callId: string,
  action: string,
  input: Record<string, unknown>,
): Promise<void> {
  const outcome = await runFor(action, input)
  await getBridge()?.assistant.actionResult({ callId, outcome })
}

async function runFor(action: string, input: Record<string, unknown>): Promise<ActionOutcome> {
  // Checked here rather than trusted: the main process reads the same registry, but the name
  // still crossed a boundary, and `runConfirmedAction` takes an `ActionName` the compiler can
  // no longer vouch for on this side.
  const known = assistantAction(action)
  if (!known) return { ok: false, refusal: 'badInput' }

  const { given, wire } = splitConsent(input)

  try {
    /**
     * Loaded on the call rather than at launch, and this is the one edge that decides it: the
     * handler table reaches all fourteen families — the canvas, the scene, the rig, git — some
     * thirty modules the opening chunk has no use for, on a door that is off by default.
     */
    const { runConfirmedAction } = await import('./executor')
    return await runConfirmedAction(known.name, given, wire)
  } catch {
    // Nothing may leave this window unanswered: the client on the other end waits two minutes
    // for a reply it would otherwise never get. `failed` rather than `badInput`, which named a
    // full disk, a refused path and a dropped connection as the caller's own parameters.
    return { ok: false, refusal: 'failed' }
  }
}

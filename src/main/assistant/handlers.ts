import type { WebContents } from 'electron'
import {
  CHANNELS,
  EVENTS,
  MAX_LOG_MESSAGE,
  type AssistantActionResult,
  type AssistantVisualCaptureResult,
} from '@shared/ipc'
import type { AssistantNote } from '@shared/domain/assistantNote'
import { clipped } from '@shared/text'
import { handle } from '@main/ipc/handle'
import { log } from '@main/log'
import type { ActivityLog } from '@main/project/activityLog'
import type { Transcript } from './transcript'
import type { RunningTasks } from '@main/task/runningTasks'
import { sendToSender } from '@main/ipc/broadcast'
import type { AssistantBrain } from './brainPort'
import { lineOfNote, reportOfNote } from './noteJournal'
import type { Said } from './said'
import { parseActionResult, parseNote, parseThought } from './validation'

export type AssistantHandlerDeps = {
  brain: AssistantBrain
  /** Where a window's answer to an action asked for from outside goes — see `createRemoteActions`. */
  settleAction: (result: AssistantActionResult) => void
  settleVisualCapture: (result: AssistantVisualCaptureResult) => void
  /** The studio's one table of long tasks — the same the montage stop button reaches through. */
  running: RunningTasks
  /** Where a turn is written down. Read per call: a project can be closed mid-conversation. */
  journal: () => ActivityLog
  /** Where the WHOLE of a round trip goes — see `transcript.ts`. */
  transcribe: Transcript
  /** What the last prompts carried, for a reader who unfolds one — see `said.ts`. */
  said: Said
}

/**
 * A turn lives exactly as long as the window that asked for it — invariant 6. ONE controller per
 * window, not one per turn: `once` only detaches when it fires, so a listener per turn piles up
 * for as long as the window lives and Node warns at the eleventh.
 */
const lifetimes = new WeakMap<WebContents, AbortSignal>()

/** One turn per window — `say` refuses a second sentence while one runs. */
const turnOf = (sender: WebContents): string => `assistant-turn-${sender.id}`

function whileAlive(sender: WebContents): AbortSignal {
  const held = lifetimes.get(sender)
  if (held) return held

  const abort = new AbortController()
  sender.once('destroyed', () => abort.abort())
  lifetimes.set(sender, abort.signal)

  return abort.signal
}

export function registerAssistantHandlers({
  brain,
  settleAction,
  settleVisualCapture,
  running,
  journal,
  transcribe,
  said,
}: AssistantHandlerDeps): void {
  /**
   * 🛑 The one funnel both sides pass through — see `AssistantNote`. Its blind spot: `say` holds
   * one turn per WINDOW, not per process, so two windows conversing at once interleave into one
   * journal with nothing naming which turn a line belongs to.
   */
  const note = (one: AssistantNote): void => {
    // The prompt alone: everything else the journal already carries whole.
    const report = reportOfNote(one, one.kind === 'sent' ? said.keep(one.text) : undefined)
    /**
     * 🛑 The round trips ALONE reach the transcript, and that is what keeps a synchronous disk
     * write off a channel a renderer drives: `ran` and `asked` arrive over IPC at whatever rate a
     * window sends them, and both are short enough that the journal already holds them whole.
     */
    if (one.kind === 'sent' || one.kind === 'answered') transcribe(lineOfNote(one))
    // Cut rather than keyed: `main.log` turns over at a megabyte, and its reader wants a sentence.
    log[report.level]('assistant', clipped(lineOfNote(one), MAX_LOG_MESSAGE))
    journal().record(report)
  }
  // The channel is typed, but TypeScript is gone at runtime and the sender is a renderer: what
  // arrives is `unknown` until this says otherwise.
  handle(CHANNELS.assistantThink, async (event, request) =>
    // Named by the window that asked, so a stop from that window reaches its turn and no other.
    // `say` refuses a second sentence while one runs, which is what keeps the name free.
    running.run(turnOf(event.sender), signal =>
      brain.think(parseThought(request), {
        signal: AbortSignal.any([whileAlive(event.sender), signal]),
        onNote: note,
        // To the sender alone: a second window watching this one's turn would show words nobody
        // there typed. `sendToSender` is what guards a window closed mid-answer.
        onProgress: progress => sendToSender(event.sender, EVENTS.assistantStream, progress),
      }),
    ),
  )

  // Not scoped to its sender, and nothing about it is: what a door reads in one go is the same
  // answer for every window of this studio.
  handle(CHANNELS.assistantWindow, () => brain.window())

  handle(CHANNELS.assistantStop, event => {
    running.cancel(turnOf(event.sender))
    return Promise.resolve()
  })

  handle(CHANNELS.assistantActionResult, (_event, result) => {
    settleAction(parseActionResult(result))
  })

  handle(CHANNELS.assistantVisualCaptureResult, (_event, result) => {
    settleVisualCapture(result)
  })

  handle(CHANNELS.assistantNote, (_event, one) => {
    note(parseNote(one))
  })

  /**
   * 🛑 Not scoped to its sender, and that is a decision: any window of this studio may read any
   * turn's prompt. A briefing holds no secret — the key never leaves `askCloudChat` — but it does
   * hold this machine's folders and the open project's context, so a window on another project
   * reads them.
   */
  handle(CHANNELS.assistantSaid, (_event, key) =>
    Promise.resolve(typeof key === 'string' ? said.at(key) : null),
  )
}

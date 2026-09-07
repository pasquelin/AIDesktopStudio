import type { BrowserWindow } from 'electron'
import type { NewDocumentAnswer, NewDocumentAsk } from '@shared/domain/newDocument'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { openNewDocumentWindow } from './windows'

type Pending = {
  ask: NewDocumentAsk
  window: BrowserWindow
  answer: (given: NewDocumentAnswer | null) => void
}

let pending: Pending | null = null

/**
 * Answers whoever is waiting, once, and takes the window down with it.
 *
 * `destroy` and not `close`: closing is announced a turn later, and a question asked in that gap
 * would be handed the window still showing the previous one. Nothing listens for this window's
 * `close`, so there is nothing to lose by skipping it.
 */
function settle(given: NewDocumentAnswer | null): void {
  const question = pending
  pending = null
  if (!question) return

  question.answer(given)
  if (!question.window.isDestroyed()) question.window.destroy()
}

/**
 * The naming of a document, held here because it spans two windows: the studio asks, another
 * window answers, and only this side sees both.
 *
 * A window closed with nothing answered IS the answer `null` — cancelling means no document, and
 * the close button says it as plainly as the Cancel one.
 */
export function registerNewDocumentWindow(): void {
  handle(CHANNELS.newDocumentAsk, (event, ask) => {
    // One question at a time: a second would be answered by a field already carrying a caret.
    if (pending) {
      openNewDocumentWindow()
      return Promise.resolve(null)
    }

    const window = openNewDocumentWindow()

    return new Promise<NewDocumentAnswer | null>(answer => {
      const question: Pending = { ask, window, answer }
      pending = question

      // Identity-checked on the QUESTION, not on the window: a settled one takes its window down,
      // and the announcement of that must not cancel whatever question came after it.
      const called = (): void => {
        if (pending === question) settle(null)
      }

      window.once('closed', called)
      // The studio window that asked, gone — ⌘W, or a reload in development. Nobody is left to
      // answer, and without this the question would sit here refusing every later one.
      event.sender.once('destroyed', called)
    })
  })

  handle(CHANNELS.newDocumentRequest, () => Promise.resolve(pending?.ask ?? null))

  handle(CHANNELS.newDocumentAnswer, (_event, given) => {
    settle(given)
    return Promise.resolve()
  })
}

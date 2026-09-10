import type { CloseChoice } from '@shared/domain/document'
import { fillHoles, TRANSLATIONS } from '@shared/i18n'
import { windowLanguage } from '@main/window/language'

/**
 * The two questions a document asks before it goes away, phrased here rather than in the
 * window.
 *
 * Native, like the one the settings window already asks: this is the convention every desktop
 * application answers with, and a drawn dialog would be the one surface of the studio the OS
 * does not put in front. The renderer asks the question; it never phrases it — the wording and
 * the button order are the main process's, beside the menu's.
 *
 * `AskUser` is injected for the same reason `reveal` is: `dialog` needs a live app, and a test
 * has none.
 */
export type AskUser = (options: {
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
}) => Promise<number>

/**
 * What to do with a document that has unsaved work.
 *
 * Cancel is the cancel button AND what a dismissed dialog gives back: closing a tab is the one
 * gesture here that throws work away, so an Escape must never be read as consent.
 */
export async function askCloseChoice(ask: AskUser, title: string): Promise<CloseChoice> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].documents

  const chosen = await ask({
    message: fillHoles(t.saveTitle, { title }, language),
    detail: t.saveBody,
    // Save first: it is the platform order on macOS and the answer that loses nothing.
    buttons: [t.save, t.dontSave, t.cancel],
    defaultId: 0,
    cancelId: 2,
  })

  if (chosen === 0) return 'save'
  return chosen === 1 ? 'discard' : 'cancel'
}

/**
 * A yes-or-no. By default Cancel is BOTH the default button and what a dismissed dialog gives
 * back, so neither Return nor Escape reaches the answer that writes; `confirmByDefault` inverts
 * that, and belongs only to a question whose yes destroys nothing.
 *
 * Shared, because that button arrangement is the whole of the decision — the questions asked this
 * way sit in different files and would drift apart on which id means yes.
 */
export async function askConfirm(
  ask: AskUser,
  wording: { message: string; detail: string; confirm: string; cancel: string },
  /** Only for a question whose YES destroys nothing — see `askFlattenDocument`. */
  confirmByDefault = false,
): Promise<boolean> {
  const buttons = confirmByDefault
    ? [wording.confirm, wording.cancel]
    : [wording.cancel, wording.confirm]
  const cancelId = confirmByDefault ? 1 : 0
  const chosen = await ask({
    message: wording.message,
    detail: wording.detail,
    buttons,
    defaultId: confirmByDefault ? 0 : cancelId,
    cancelId,
  })

  return chosen === (confirmByDefault ? 0 : 1)
}

/**
 * Whether to write over a file something else has changed.
 *
 * The one question in this file about work that is not the studio's: the bytes on disk came from
 * another application, and overwriting them is the only gesture here that destroys something the
 * user never saw. Cancel is the default and the dismissal for that reason.
 */
export async function askOverwriteDocument(ask: AskUser, title: string): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].documents

  return await askConfirm(ask, {
    message: fillHoles(t.overwriteTitle, { title }, language),
    detail: t.overwriteBody,
    confirm: t.overwriteConfirm,
    cancel: t.cancel,
  })
}

/** Whether the file really goes. Irreversible, so Cancel is both the default and the dismissal. */
export async function askDeleteDocument(ask: AskUser, title: string): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].documents

  return await askConfirm(ask, {
    message: fillHoles(t.deleteTitle, { title }, language),
    detail: t.deleteBody,
    confirm: t.deleteConfirm,
    cancel: t.cancel,
  })
}

/**
 * Whether the picture behind this document may take the flatten.
 *
 * The one question of this file that DEFAULTS to yes: the document was written first and holds
 * the whole stack, so what is at stake is a surprise rather than a loss.
 */
export async function askFlattenDocument(
  ask: AskUser,
  title: string,
  format: string,
  lost: string,
): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].documents

  return await askConfirm(
    ask,
    {
      message: fillHoles(t.flattenTitle, { title, format }, language),
      detail: fillHoles(t.flattenBody, { format, lost }, language),
      confirm: t.flattenConfirm,
      cancel: t.cancel,
    },
    true,
  )
}

/**
 * Whether to bring back work a previous session had not written down.
 *
 * Defaults to YES, like the flatten above and for the same shape of reason: saying yes puts the
 * work back in front of the person who made it and destroys nothing, where saying no keeps every
 * entry waiting. Nothing is purged either way — an offer declined is not an abandonment (§9.1).
 */
export async function askRestoreRecovery(ask: AskUser, count: number): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].documents

  return await askConfirm(
    ask,
    {
      message: fillHoles(t.recoveryTitle, { count }, language),
      detail: t.recoveryBody,
      confirm: t.recoveryConfirm,
      cancel: t.recoveryLater,
    },
    true,
  )
}

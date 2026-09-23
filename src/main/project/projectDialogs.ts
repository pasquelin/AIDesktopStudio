import { fillHoles, TRANSLATIONS } from '@shared/i18n'
import type { FileUse } from '@shared/domain/fileUse'
import { windowLanguage } from '@main/window/language'
import { askConfirm, type AskUser } from './documentDialogs'

/**
 * Whether the studio may lay a project into a folder that already holds files of its own.
 *
 * Asked rather than refused: dropping a project beside an existing set of rushes is a legitimate
 * gesture, and the studio only ADDS folders — nothing of theirs is touched. What it must not do
 * is do it silently, since `assets` and `documents` appearing in someone's folder unannounced
 * reads as the application having made a mess.
 */
export async function askUseOccupiedFolder(ask: AskUser, folder: string): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].project

  return await askConfirm(ask, {
    message: fillHoles(t.occupiedTitle, { folder }, language),
    detail: t.occupiedBody,
    confirm: t.occupiedConfirm,
    cancel: t.occupiedCancel,
  })
}

/**
 * Whether the project may be left while generations are still running — closed, or swapped for
 * another, which does the same thing to them.
 *
 * They are not at risk: the manager refuses to file them anywhere but in their own project, and
 * picks them up when it is opened again. What is at risk is the person's understanding — they
 * leave the bar on the way out, and nothing else in the studio would say where they went.
 */
export async function askLeaveWithJobs(ask: AskUser, count: number): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].project

  return await askConfirm(ask, {
    message: t.leaveRunningTitle,
    // The count rides in the DETAIL, and the title carries none: this file has no plural forms,
    // and « 1 générations » is what a title built from a number would have read on a lone job.
    detail: fillHoles(t.leaveRunningBody, { count }, language),
    confirm: t.leaveRunningConfirm,
    cancel: t.leaveRunningCancel,
  })
}

/**
 * Whether a project's whole FOLDER goes to the trash, named so the answer is about that one.
 *
 * 🛑 Asked here rather than behind `project.trash`, which the wire can call: a native dialog on
 * that path would stand for good, nobody on the other side of the machine being able to answer
 * it. The gesture made AT the machine — the shelf's own menu — comes through this route first.
 *
 * Everything else that shelf offers is a shortcut one can put back by reopening the project. This
 * one is not, so it is the row that asks.
 */
export async function askTrashProject(ask: AskUser, name: string): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].project

  return await askConfirm(ask, {
    message: fillHoles(t.trashTitle, { name }, language),
    detail: t.trashBody,
    confirm: t.trashConfirm,
    cancel: t.trashCancel,
  })
}

/**
 * Whether a BATCH really goes to the trash. Asked from two files up, never from a window.
 *
 * Asked at all because this is the one gesture the explorer offers that `⌘Z` cannot take back:
 * `shell.trashItem` has no portable way back, so the studio's undo stack deliberately stops
 * here. Everything else — moving, duplicating, creating, renaming — is one keystroke away from
 * being undone and asks nothing.
 *
 * **One file still goes without a question**, which is the shape of the risk rather than a
 * softening: it is named on the row that was clicked, its own name is in the menu, and it lands
 * somewhere the system offers to put back. A selection of thirty is a number nobody re-reads.
 */
export async function askTrashFiles(ask: AskUser, count: number): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].explorer

  return await askConfirm(ask, {
    message: fillHoles(t.trashTitle, { count }, language),
    detail: t.trashBody,
    confirm: t.trashConfirm,
    cancel: t.trashCancel,
  })
}

/**
 * The files a deletion would take out from under a document — §9.2, and the one warning nothing
 * gave: a texture a scene draws went to the trash without a word.
 *
 * The documents are NAMED, never counted: « three documents use it » leaves the person to guess
 * which, and the whole point is that they can go and look before answering.
 */
export async function askTrashUsedFiles(ask: AskUser, uses: readonly FileUse[]): Promise<boolean> {
  const language = windowLanguage()
  const t = TRANSLATIONS[language].explorer

  return await askConfirm(ask, {
    message: fillHoles(t.trashUsedTitle, { count: uses.length }, language),
    detail: `${t.trashUsedBody}\n${uses.map(use => use.title).join('\n')}`,
    confirm: t.trashConfirm,
    cancel: t.trashCancel,
  })
}

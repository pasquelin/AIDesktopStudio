import type { Project } from '@shared/domain/project'
import { refreshDocuments } from '@/features/shell/documentIo'
import { closeOrphanTabs } from '@/features/shell/orphanTabs'
import { forgetReportedFailures, traceFailure } from '@/services/diagnostics'
import { readProjectScripts } from './code'
import { useActivity } from './activity'
import { useProjectContext } from './projectContext'
import { forgetAssetRevisions } from './assetRevisions'
import { forgetRememberedAssets, useAssets } from './assets'
import { useLayouts } from './layouts'
import { useSceneClipboard } from './sceneClipboard'
import { useSelection } from './selection'

/**
 * The follow in flight, and which project it is for.
 *
 * 🛑 A project change is announced TWICE — by the broadcast the main process fires on its way
 * past, and by the call that asked for it — and which arrives first is not ours to settle:
 * `invoke` and `send` are two messages, and the listener reads a store the caller may already
 * have written. On one order the follow ran unattended, so `documents.list` right after
 * `project.open` answered on the project just left; on the other the listener's own guard saw no
 * change and the follow did not run at all. Held here, the first caller runs it and the second
 * awaits the same promise.
 */
let followed: string | null | undefined
let following: Promise<void> = Promise.resolve()

/**
 * The FIRST follow of a window, which is a start rather than a change: it runs whatever the
 * window had followed before — an empty studio still has orphan tabs of its own to settle.
 */
export function followFirst(project: Project | null): Promise<void> {
  followed = undefined
  return follow(project)
}

export function follow(project: Project | null): Promise<void> {
  const path = project?.path ?? null
  // The same folder announcing itself again is a manifest rewritten under it: following that
  // would dismiss every toast and refetch three lists to update nothing.
  if (followed === path) return following
  followed = path
  following = followedSafely(project, path)
  return following
}

/**
 * The follow, and what a failed one leaves behind.
 *
 * Never rethrown: three callers hand this to a `void`, and a follow that gave up is not a project
 * that failed to open — the one that DOES answer for the opening is the main process. Forgotten
 * as well, so the next attempt at this folder tries again.
 */
async function followedSafely(project: Project | null, path: string | null): Promise<void> {
  try {
    await followProject(project)
  } catch (error) {
    followed = undefined
    traceFailure('shell.dropped', path ?? '', error)
  }
}

/**
 * What follows the project, in order: the arrangement first, since dropping the layouts of
 * another project is what tells the documents which tabs are still open.
 */
async function followProject(project: Project | null): Promise<void> {
  useLayouts.getState().adopt(project?.path ?? null)
  // A copied model names an asset of the project it came from: pasted into another one, it
  // would list in the outliner and draw nothing, with no way to tell why.
  useSceneClipboard.setState({ nodes: [] })
  // Another project's assets are another story: a file that failed to load in the last one has
  // nothing to say about this one, and a failure here is news again.
  forgetReportedFailures()
  // The journal lives in the project's own catalogue, so it is another project's account of
  // itself: left alone, its lines and its failure count would carry over into this one. The
  // toasts too — they never expire, so one raised by the project being left would hang over
  // the one being opened, naming an asset that is no longer anywhere.
  useActivity.getState().dismissAll()
  // Assets and folder rows are named for the project that is being left: a path still picked
  // resolves inside the new one, so its own explorer highlighted a file nobody chose — and ⌘⌫
  // would have trashed it.
  useSelection.getState().selectFiles([])
  const [, folderAnswered] = await Promise.all([
    useAssets.getState().refresh(),
    refreshDocuments(project?.path ?? null),
    // The scripts belong to the folder, like the context below: nothing else re-reads them now
    // that the editor is a document rather than a panel with an effect on the open project.
    readProjectScripts(),
    useActivity.getState().reload(),
    // The context belongs to the folder: one left behind would be previewed under the next
    // project, and added to everything generated in it.
    useProjectContext.getState().reload(),
  ])

  // AFTER the catalogue has been read, never before it: the by-id index remembers every asset it
  // has been shown — so that a browsing facet cannot take the names off an open montage — and
  // until `refresh` answers, `items` still holds the rows of the project being left. Forgetting
  // first leaves any render in that window putting them straight back, for the session's life.
  forgetRememberedAssets()
  // Another project's stamps say nothing about this one's files, and this map has no other
  // way to shrink.
  forgetAssetRevisions()

  // Last, and only on a folder that answered: the reconciliation above is what says which tabs
  // have a document, and a listing that failed says nothing about any of them.
  if (folderAnswered) closeOrphanTabs()

  // After the tabs have settled, so what is offered is what nothing else already holds — and
  // OFFERED, never taken back in silence (§9.1, guarantee 5).
  if (project) {
    const { offerRecoveredWork } = await import('@/features/shell/documentRecovery')
    await offerRecoveredWork()
  }
}

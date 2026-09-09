import { orElse } from '@shared/promises'
import { messageOf } from '@shared/guards'
import { create } from 'zustand'
import {
  projectPickerFolder,
  movedProjectKey,
  movedRecentProject,
  type Project,
} from '@shared/domain/project'
import type { ProjectBinned } from '@shared/ipc'
import type { StudioBridge } from '@shared/ipc'
import {
  refreshDocuments,
  renamedDocumentProject,
  settleUnsavedWorkForProjectChange,
} from '@/features/shell/documentIo'
import { readProjectScripts } from './code'
import { closeOrphanTabs } from '@/features/shell/orphanTabs'
import { getBridge } from '@/services/bridge'
import { forgetReportedFailures, reportFailure } from '@/services/diagnostics'
import { useSettings } from './settings'
import { useActivity } from './activity'
import { useProjectContext } from './projectContext'
import { forgetRememberedAssets, useAssets } from './assets'
import { forgetAssetRevisions } from './assetRevisions'
import { useLayouts } from './layouts'
import { useSceneClipboard } from './sceneClipboard'
import { useSelection } from './selection'
import { settleFileViews } from '@/features/shell/components/dockviewApi'

/** How leaving a project ended. `nothing` is a window that had none open — a second one asking. */
export type ProjectLeft = 'left' | 'kept' | 'failed' | 'nothing'

/** What a rename answered: the project under its new name and folder, or why it did not happen. */
export type ProjectRenamed = { ok: true; project: Project } | { ok: false; why: string | null }

/**
 * What a trashing answered. `trashed: false` is a folder the disk had already lost — the row still
 * goes, and a caller told otherwise reports a bin that never happened. `declined` is the person
 * keeping their project, which is a no rather than a failure.
 */
export type ProjectTrashed =
  { ok: true; trashed: boolean } | { ok: false; declined: boolean; why: string | null }

type ProjectState = {
  project: Project | null
  /**
   * False until the main process has said which project is open, if any. The initial `null` is
   * "not asked yet", not "none" — and the studio reopens the last project on launch, so a
   * surface that took it for an answer would offer to create a project to someone who has one.
   */
  known: boolean

  /** Loads the open project and keeps following it. Returns the unsubscribe function. */
  connect: () => Promise<() => void>
  openPicked: () => Promise<void>
  createPicked: () => Promise<void>
  /**
   * Opens a known folder — what the home's shelf of recent projects and the title bar's menu
   * click through to. Answers whether it worked: a folder moved or deleted since it was last
   * opened is the ordinary case for that shelf, and the entry has to go rather than fail again
   * on the next click.
   *
   * The folder already open is answered `true` without being reopened. Here rather than in
   * whichever surface noticed, for the same reason the forgetting below is: both lists offer the
   * open project as a row, and reopening it tears down every panel's state and reloads the
   * catalogue to land on the folder already in front.
   */
  open: (path: string) => Promise<boolean>
  /**
   * Makes a project at an absolute path and opens it — what an outside client reaches for, where
   * a person gets the picker. Here rather than in the handler so that it leaves the open project
   * the way every other gesture does: the questions first, then the folder.
   *
   * `null` when a question was answered no, when the folder would not serve, or when the main
   * process asked about an occupied folder and was turned down.
   */
  createAt: (path: string) => Promise<Project | null>
  /**
   * Leaves the open project with none in its place — the row stays on the shelf, unlike
   * forgetting one. `lastProject` goes with it, or the next launch reopens what was just closed.
   *
   * 🛑 WHICH ending, not a boolean: `kept` is a no to one of the two questions on the way out, and
   * `failed` is the settling giving out. Read as one, a caller told the person had chosen to keep
   * their project over a catalogue that had in fact crashed.
   */
  close: () => Promise<ProjectLeft>
  /**
   * Drops a folder from the shelf of recent projects. The folder itself is untouched: this is a
   * list of shortcuts, and forgetting one is not a gesture on someone's disk.
   *
   * Reopening the project puts it back, which is what makes the row's menu safe to offer without
   * a confirmation.
   */
  forget: (path: string) => Promise<void>
  /**
   * 🛑 BINS the folder, where `forget` above only drops a shortcut. The open project is LEFT
   * first, through `close` and its two questions — a no there keeps the folder. Everything keyed
   * on the path goes with it, as a rename moves it.
   */
  trash: (path: string) => Promise<ProjectTrashed>
  /**
   * Gives a project a new name, which MOVES its folder — a project is named by its folder.
   *
   * Two writes, and they belong together: the main process owns the folder, and this owns
   * everything keyed on the path it just left — the shelf, `lastProject`, the account link, the
   * per-project roles and the adopted layout. The folder moves FIRST, so nothing here ever claims
   * a path the disk refused.
   *
   * Here rather than in the row that offered it, for the same reason the forgetting above is: two
   * surfaces list projects, and a rename wired into one of them would be missing from the other.
   *
   * 🛑 A refusal carries its REASON, never a bare no: told only that it failed, the assistant
   * announced to the person that no rename was needed — measured 2026-08-31.
   */
  rename: (path: string, name: string) => Promise<ProjectRenamed>
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
}

/**
 * The two questions every way of leaving a project owes the person taking it, in the order they
 * have to be asked: the generations that will drop out of the bar, then the documents holding
 * unsaved work. Reversed, three documents would be answered for and the gesture then called off.
 *
 * `false` is a no to either. Neither raises anything in the ordinary case — no generation
 * running, no document to answer for.
 */
async function settleLeaving(bridge: StudioBridge): Promise<boolean> {
  return (
    (await bridge.project.askLeave()) &&
    (await settleUnsavedWorkForProjectChange()) &&
    (await settleFileViews())
  )
}

/**
 * A folder chosen in the dialog, turned into a project — or `null` for each of the three ways
 * that does not happen: no bridge, a cancelled dialog, a folder the main process refused.
 *
 * The refusal is swallowed rather than raised: every caller of the two gestures below does
 * `void openPicked()`, so a rejection left to travel was an unhandled one, and the main has
 * already recorded the reason — which reaches the screen even with no project open to keep it.
 */
async function pickedProject(
  from: (bridge: StudioBridge, folder: string) => Promise<Project | null>,
): Promise<Project | null> {
  const bridge = getBridge()
  const { projectsFolder, recentProjects } = useSettings.getState().settings.storage
  const folder = await bridge?.dialog.pickPath(
    'folder',
    projectPickerFolder(projectsFolder, recentProjects),
  )
  if (!bridge || !folder) return null

  // After the folder is chosen and before anything is torn down: a cancelled picker must not put
  // a question about documents in front of someone who changed their mind about the picker. And
  // never for the folder already open — `open` refuses that one outright, where this cannot: the
  // main process answers a folder that is already a project by opening it, whichever it is.
  const again = folder === useProject.getState().project?.path
  if (!again && !(await settleLeaving(bridge))) return null

  try {
    return await from(bridge, folder)
  } catch {
    return null
  }
}

/**
 * Drops what is keyed on a folder, THROUGH the main process — see `settingsWithoutProject`.
 *
 * 🛑 The path travels, never the new lists: composed here they would be composed from this
 * window's replica, and everything the main process wrote since the last broadcast would go with
 * them. Measured 2026-09-09 — two trashings straight after an open dropped the OPEN project off
 * the shelf, `lastProject` cleared, and reopening the project it still showed repaired nothing.
 */
async function forgotten(path: string, owned: boolean): Promise<void> {
  const settings = await getBridge()?.settings.forgetProject(path, owned)
  if (settings) useSettings.setState({ settings })
}

/**
 * The open project is owned by the main process; this is the renderer's replica, refreshed by
 * broadcast so every window agrees on which project is open.
 */
const projectState: ProjectState = {
  project: null,
  known: false,

  connect: async () => {
    const bridge = getBridge()
    // Nothing will ever answer, so the answer is "none": surfaces that wait to be told — the
    // home draws nothing until then — would otherwise wait for the rest of the session.
    if (!bridge) {
      useProject.setState({ known: true })
      return () => {}
    }

    // The main process reopens the last project on launch without waiting for it, so the answer
    // to `current()` can be the `null` of a moment already gone by the time it arrives. An
    // announcement wins over it, always: it is the later truth, and taking the stale `null`
    // dropped the persisted arrangement of a project that was in fact open.
    let announced = false

    // Another project means another catalogue, another folder of documents, and another
    // arrangement: nothing of the previous one may be left showing.
    const stop = bridge.project.onChange(project => {
      announced = true
      const before = useProject.getState().project?.path
      useProject.setState({ project, known: true })

      /**
       * Only when ANOTHER FOLDER is in front. A rename moves the folder, so it does follow — and
       * it must: the layouts, the assets and the documents are all keyed on the path that just
       * changed. The same folder announcing itself again is a manifest rewritten under it, and
       * following that would dismiss every toast and refetch three lists to update nothing.
       */
      if (project?.path !== before) void followProject(project)
    })

    // A refusal is an answer too. Left to throw, `connect` never hands back the unsubscribe —
    // stranding the listener — and never says which project is open, which the home reads as
    // "still asking" and holds a blank page on.
    const current = await orElse(bridge.project.current(), null)
    if (announced) return stop

    useProject.setState({ project: current, known: true })
    await followProject(current)
    return stop
  },

  open: async path => {
    const bridge = getBridge()
    if (!bridge) return false
    // Already in front: the tick on the row said so, and choosing it means "yes, still".
    if (path === useProject.getState().project?.path) return true

    // `refreshDocuments` drops every open document a beat from here, and no `beforeunload` sees
    // a project change — `guardUnsavedWork` says so itself, which is why this asks at all.
    if (!(await settleLeaving(bridge))) return false

    try {
      useProject.setState({ project: await bridge.project.open(path), known: true })
      return true
    } catch {
      // Forgotten here rather than by whoever clicked: an opening can fail from anywhere, and a
      // list that only forgets when the home asked it keeps offering a folder nothing can open.
      // Swallowed on the way: this is already the failing path, and `open` answers `false`
      // whether or not the shelf could be written.
      try {
        await useProject.getState().forget(path)
      } catch {
        // Already the failing path: `open` answers `false` either way, as the note above says.
      }

      return false
    }
  },

  close: async () => {
    const bridge = getBridge()
    const leaving = useProject.getState().project
    // Nothing to leave, and the settings below would then clear a `lastProject` this window has
    // no business clearing — a second window closing the same project reaches here too.
    if (!bridge || !leaving) return 'nothing'

    if (!(await settleLeaving(bridge))) return 'kept'

    try {
      await bridge.project.close()
    } catch (error) {
      // `settle` writes to the disk and to the catalogue, so this can genuinely fail — and every
      // caller does `void close()`. Left to travel it was an unhandled rejection, after the user
      // had already been asked about their unsaved work.
      reportFailure('project.close', leaving.path, error)
      return 'failed'
    }

    // The broadcast has in fact already emptied every panel — the main process fires `onChange`
    // on its way past. Set here all the same, as `open` sets what it opened.
    useProject.setState({ project: null })

    try {
      await useSettings.getState().write({ storage: { lastProject: undefined } })
    } catch (error) {
      // The project IS closed, so rejecting into the `void` of every caller would say nothing.
      // What is lost is the pointer: the next launch reopens what was just closed, and the
      // journal is the only place that can say why.
      reportFailure('project.close', leaving.path, error)
    }

    return 'left'
  },

  createAt: async path => {
    const bridge = getBridge()
    if (!bridge) return null
    if (!(await settleLeaving(bridge))) return null

    const created = await bridge.project.create(path)
    // Created and then opened, because a project nobody is in is a folder. `open` asks nothing a
    // second time: the folder it is handed is the one the main process has already switched to.
    if (!created) return null

    useProject.setState({ project: created, known: true })
    return created
  },

  forget: async path => {
    await forgotten(path, false)
  },

  trash: async path => {
    const bridge = getBridge()
    if (!bridge) return { ok: false, declined: false, why: null }

    // Left through the same door every other exit takes, so the questions about running
    // generations and unsaved work are asked BEFORE the folder goes.
    const wasOpen = useProject.getState().project?.path === path
    if (wasOpen) {
      const left = await useProject.getState().close()
      // The ENDING travels, never a sentence: the caller writes the words, as it does for a bin
      // the disk refused — see `trashProject`.
      if (left !== 'left') return { ok: false, declined: left === 'kept', why: left }
    }

    /**
     * 🛑 Put BACK when nothing was binned. The project has to be closed before the folder can go —
     * its catalogue holds a file inside it — so a refusal reached a person whose project had been
     * shut for a gesture that never happened, with `lastProject` cleared and nothing to reopen it.
     */
    const kept = async (why: string): Promise<ProjectTrashed> => {
      if (wasOpen) await useProject.getState().open(path)
      return { ok: false, declined: false, why }
    }

    let binned: ProjectBinned
    try {
      binned = await bridge.project.trash(path)
    } catch (error) {
      // The folder still stands, so nothing keyed on it may be dropped: a shelf that forgot a
      // project the disk still holds is a project nobody can find again.
      return await kept(messageOf(error))
    }

    if (binned === 'not-a-project') return await kept('not-a-project')

    /**
     * 🛑 The account link and the roles go ONLY on a real bin. `missing` is a folder the disk does
     * not hold right now — an unplugged drive as much as a deletion — and pruning on that is the
     * silent adoption `storage.projectAccounts` was split out to prevent. The shelf ROW still
     * goes: it is a shortcut, and a failed opening already drops it.
     */
    const trashed = binned === 'trashed'
    await forgotten(path, trashed)

    return { ok: true, trashed }
  },

  rename: async (path, name) => {
    const bridge = getBridge()
    if (!bridge) return { ok: false, why: null }

    let renamed: Project
    try {
      renamed = await bridge.project.rename(path, name)
    } catch (error) {
      // Already in the journal, put there by the handler: this answers the caller and stops. The
      // settings are deliberately left alone — a name the disk refused must not be listed.
      // 🛑 The REASON travels: a caller told only "no" said so to a model, which invented one.
      return { ok: false, why: messageOf(error) }
    }

    // Only when it is the open one. The broadcast the handler sends reaches the OTHER windows;
    // this one is already past it, and waiting for a round trip would leave the title bar naming
    // the old name for a frame.
    const wasOpen = useProject.getState().project?.path === path
    if (wasOpen) {
      renamedDocumentProject(path, renamed.path)
      useProject.setState({ project: renamed })
    }

    /**
     * 🛑 Everything keyed BY FOLDER moves with it, and the account link above all: orphaned at the
     * old path, `planProjectAccount` answers `adopt` and the project silently comes back on
     * whichever key is active — a destructive write nobody asked for.
     */
    const { settings, write } = useSettings.getState()
    await write({
      storage: {
        recentProjects: movedRecentProject(settings.storage.recentProjects, path, renamed.path),
        projectAccounts: movedProjectKey(settings.storage.projectAccounts, path, renamed.path),
        // The pointer the next launch reopens names a FOLDER: left at the old one the studio
        // starts on a path nothing answers, and forgets the project on the way.
        ...(settings.storage.lastProject === path ? { lastProject: renamed.path } : {}),
      },
      ai: { projectRoles: movedProjectKey(settings.ai.projectRoles, path, renamed.path) },
    })

    // The tabs a person arranged are adopted BY FOLDER too, and `adopt` blanks the layout when the
    // path it holds is not the one in front — the arrangement would be lost at the next opening.
    if (wasOpen) useLayouts.getState().adopt(renamed.path)

    return { ok: true, project: renamed }
  },

  openPicked: async () => {
    const picked = await pickedProject((bridge, folder) => bridge.project.open(folder))
    if (picked) useProject.setState({ project: picked, known: true })
  },

  createPicked: async () => {
    // The folder chosen IS the project, and it names itself. What the main process makes of it —
    // a fresh project, the one already there, or a refusal — is its call, not the window's.
    const picked = await pickedProject((bridge, folder) => bridge.project.create(folder))
    if (picked) useProject.setState({ project: picked, known: true })
  },
}

export const useProject = create<ProjectState>()(() => projectState)

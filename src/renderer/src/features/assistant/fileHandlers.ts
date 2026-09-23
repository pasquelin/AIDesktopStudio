import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { documentExtensionOf, isDocumentExtension } from '@shared/domain/document'
import { FOLDER_ROOT } from '@shared/domain/folder'
import {
  projectFailureIn,
  projectName,
  projectRenameFailureIn,
  projectPathFor,
  projectPickerFolder,
  projectsByCreation,
  type Project,
  type ProjectOpenFailure,
  type ProjectRenameFailure,
} from '@shared/domain/project'
import { messageOf } from '@shared/guards'
import type { StudioBridge } from '@shared/ipc'
import { getBridge } from '@/services/bridge'
import { openProjectFile, type FileOpening } from '@/helpers/openProjectFile'
import { documentAtPath, useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { withBridge, type ActionHandlers } from './actionHandler'
import { boolOf, textOf, textsOf } from './actionInputs'

/**
 * The project folder, walked and changed from outside the window.
 *
 * Every one of these goes through the channel the Explorer uses, so a batch lands in the file
 * undo stack and in the activity journal exactly as a drag would.
 */

/**
 * Runs against the OPEN project, refusing for the right one of two reasons.
 *
 * The two were answered as `noBridge` together at first, which told a client its window was
 * unreachable when the real answer was that a relative path had nothing to be relative to.
 */
const NO_PROJECT =
  'no project is open, and a path is relative to one — projects.list answers the ones this machine ' +
  'knows, project.open opens one and project.create makes one'

function inProject(run: (bridge: StudioBridge) => Promise<unknown>): Promise<ActionOutcome> {
  if (!getBridge())
    return Promise.resolve(
      refused('noBridge', 'this window is not connected to the studio process'),
    )
  if (!useProject.getState().project) return Promise.resolve(refused('noProject', NO_PROJECT))

  return withBridge(run)
}

/**
 * The same, followed by the relist a write owes its next reader.
 *
 * The store learns of a batch through an event, but a client calling `files.list` in the very
 * next message would otherwise read the listing from before its own move — the round trip is
 * faster than the watcher.
 */
async function changing(run: (bridge: StudioBridge) => Promise<unknown>): Promise<ActionOutcome> {
  const outcome = await inProject(run)
  if (outcome.ok) await useDocuments.getState().relist('own-write')

  return outcome
}

/** Every path-taking action needs at least one; the registry holds the list to non-empty. */
function moving(
  input: Record<string, unknown>,
  run: (bridge: StudioBridge, paths: string[], folder: string) => Promise<unknown>,
): Promise<ActionOutcome> {
  return changing(bridge =>
    run(bridge, textsOf(input, 'paths'), textOf(input, 'folder') ?? FOLDER_ROOT),
  )
}

async function facts(input: Record<string, unknown>): Promise<ActionOutcome> {
  const outcome = await inProject(bridge =>
    bridge.project.fileFacts(textOf(input, 'path') ?? FOLDER_ROOT),
  )

  // `null` is the channel's answer for an entry that is not there. `notFound` rather than
  // `badInput`: the path was a well-formed string, and a client told otherwise retries the call.
  return outcome.ok && outcome.data === null
    ? refused(
        'notFound',
        `nothing at "${textOf(input, 'path') ?? FOLDER_ROOT}" in the open project — files.list walks a folder and files.search finds by name`,
      )
    : outcome
}

/**
 * The endings that are refusals. The three that are not — a tab, an editor, another program —
 * answer `ok` and NAME which one: a model told `ok` alone reports a tab that is not there.
 */
const REFUSAL_OF_OPENING: Record<FileOpening, ActionOutcome | null> = {
  document: null,
  editor: null,
  asset: null,
  system: null,
  folder: refused(
    'badInput',
    '"path" names a folder, and this opens a file — files.list walks one instead',
  ),
  missing: refused(
    'notFound',
    'nothing at that path in the open project — files.list answers what is there, and files.search finds by name',
  ),
  unreachable: refused('noBridge', 'this window is not connected to the studio process'),
  failed: refused('failed', 'the studio could not open that file — the journal holds why'),
}

async function openFile(input: Record<string, unknown>): Promise<ActionOutcome> {
  const path = textOf(input, 'path')
  if (path === null)
    return refused(
      'badInput',
      '"path" is wanted — a path relative to the open project, as files.list answers it',
    )
  if (!useProject.getState().project) return refused('noProject', NO_PROJECT)

  /**
   * The same re-read `document.open` does — a listing the client holds may predate a file that
   * has since arrived — but only where the answer could change: a listing holds documents alone,
   * so re-walking the project for a `.png` costs one head per document and can find nothing.
   */
  if (
    isDocumentExtension(documentExtensionOf(path)) &&
    !documentAtPath(useDocuments.getState(), path)
  ) {
    await useDocuments.getState().relist('own-write')
  }

  const opening = await openProjectFile(path)
  return REFUSAL_OF_OPENING[opening] ?? { ok: true, data: { opened: opening } }
}

async function openProject(input: Record<string, unknown>): Promise<ActionOutcome> {
  const path = textOf(input, 'path')
  if (path === null)
    return refused(
      'badInput',
      '"path" is wanted — the whole path of a project folder, as projects.list answers it',
    )

  return (await useProject.getState().open(path))
    ? { ok: true }
    : refused(
        'badInput',
        `no project opened at "${path}" — projects.list answers the ones this machine knows, each with its path`,
      )
}

async function closeProject(): Promise<ActionOutcome> {
  const { project, close } = useProject.getState()
  if (!project)
    return refused('noProject', 'no project is open — projects.list answers what there is to open')

  // 🛑 WHICH ending, never the truthiness: the store raises the only question that knows whether
  // any work is at stake, and a settling that gave out is not a person saying no.
  const left = await close()
  if (left === 'left') return { ok: true }

  return left === 'kept'
    ? refused('declined', `the person at the screen kept the project open — ${WORK_AT_STAKE}`)
    : refused('failed', 'the project could not be left — the journal holds why')
}

/**
 * What each verdict asks for, in the words a model repairs from. `holds-projects` is the one a
 * person meets: a folder OF projects is not itself a project, and the studio names the new one
 * inside it — the model only has to say the name.
 */
const CREATE_REFUSALS: Record<ProjectOpenFailure, string> = {
  'holds-projects':
    'that folder already holds projects, so it is a folder OF projects rather than one itself — call this again with just the NAME of the new project, and the studio puts it inside where it keeps them',
  nested:
    'that folder sits inside a project, and a project inside a project gives the catalogue two owners for the same files — name one that is not under a project',
  'not-a-project':
    'that folder could not be read as a place for a project — name another one, or give just the NAME of the new project and let the studio place it',
  unreadable:
    "that folder holds a project whose manifest cannot be read — it is not a place to create in, and repairing it is the person's to do",
  'too-new':
    'that folder holds a project written by a newer studio than this one, which cannot create over it — name another folder',
}

async function createProject(input: Record<string, unknown>): Promise<ActionOutcome> {
  // Bare on purpose: `name` is `required`, so `runAction` refuses a call without it — and names
  // the field — before this ever runs.
  const asked = textOf(input, 'name')
  if (asked === null)
    return refused(
      'badInput',
      '"name" is wanted — what to call the new project. "folder" says where to put it, and the studio uses where this person keeps projects when it is left out',
    )

  const { projectsFolder, recentProjects } = useSettings.getState().settings.storage
  const within = textOf(input, 'folder') ?? projectPickerFolder(projectsFolder, recentProjects)
  const path = projectPathFor(asked, within ?? undefined)
  if (path === undefined) {
    return refused(
      'badInput',
      'no folder is known to put a project in yet, and none can be guessed. Give "folder" a whole ' +
        'absolute path this time.',
    )
  }

  return createProjectAt(path)
}

async function createProjectAt(path: string): Promise<ActionOutcome> {
  let created: Project | null
  try {
    created = await useProject.getState().createAt(path)
  } catch (error) {
    const why = projectFailureIn(messageOf(error))
    return refused('failed', why === null ? messageOf(error) : CREATE_REFUSALS[why])
  }
  if (!created)
    return refused(
      'declined',
      'the new project was turned down — either by the person at the screen, or because that folder already holds files',
    )

  return { ok: true, data: created }
}

/** Why leaving a project is asked about at all — the clause both refusals below borrow. */
const WORK_AT_STAKE = 'a generation may be running, or a document may hold unsaved work'

/**
 * 🛑 The path both gestures below take, refused unless the SHELF holds it — a model that builds
 * one from a NAME is the measured case, and the gesture that DESTROYS must not take an invented
 * path on trust. A field left out is told so, never sent to read a list it did not ask for.
 */
function shelvedPath(input: Record<string, unknown>): { path: string } | ActionOutcome {
  const path = textOf(input, 'path')
  if (path === null) return refused('badInput', WANTS_PATH)

  return useSettings.getState().settings.storage.recentProjects.some(one => one.path === path)
    ? { path }
    : refused('notFound', `no recent project has that path. ${FROM_THE_LIST}`)
}

const WANTS_PATH =
  '"path" is wanted — the whole path of a project folder, as projects.list answers it'

/**
 * 🛑 The pair a model must not mix up: this one drops a ROW, `trashProject` bins a FOLDER. Told
 * « retire jeu2 » with only the five other project actions to reach for, the model announced the
 * project was not on the shelf — it was, on screen.
 */
async function forgetProject(input: Record<string, unknown>): Promise<ActionOutcome> {
  const shelved = shelvedPath(input)
  if (!('path' in shelved)) return shelved

  await useProject.getState().forget(shelved.path)
  return { ok: true }
}

/**
 * 🛑 The one gesture of this file nothing in the studio takes back. `trashed: false` says the disk
 * had already lost the folder and only the row went.
 */
async function trashProject(input: Record<string, unknown>): Promise<ActionOutcome> {
  const shelved = shelvedPath(input)
  if (!('path' in shelved)) return shelved

  const { path } = shelved
  const outcome = await useProject.getState().trash(path)
  if (outcome.ok) return { ok: true, data: { path, trashed: outcome.trashed } }
  if (outcome.declined)
    return refused(
      'declined',
      `the person at the screen kept the project — ${WORK_AT_STAKE} — and nothing was binned`,
    )

  // 🛑 The REASON travels, as a refused rename's does: told only that it failed, the model made
  // one up and announced it to the person. `not-a-project` has a sentence already — the one
  // `project.create` answers a folder that will not serve.
  if (outcome.why === 'not-a-project')
    return refused('notFound', `${CREATE_REFUSALS['not-a-project']} ${FROM_THE_LIST}`)

  return refused(
    'failed',
    `"${path}" could not go to the trash${outcome.why === null ? '' : `: ${outcome.why}`}. ${FROM_THE_LIST}`,
  )
}

/**
 * 🛑 Why it did not happen, in words a model repairs from. Told only that it failed, the model
 * announced to the person that no rename was needed — and the path it had built was one it made
 * up from a NAME, over a `projects.list` that had just answered the real one.
 */
function renameProblem(path: string, why: string | null): string {
  const named = why === null ? null : projectRenameFailureIn(why)
  if (named !== null) return RENAME_REFUSALS[named]

  const folder = why === null ? null : projectFailureIn(why)

  return folder === null
    ? `"${path}" could not be renamed. ${FROM_THE_LIST}`
    : `${CREATE_REFUSALS[folder]} ${FROM_THE_LIST}`
}

const FROM_THE_LIST =
  'A project path comes from projects.list and nowhere else — never build one from its name, ' +
  'which is not what its folder is called until the rename goes through.'

const RENAME_REFUSALS: Record<ProjectRenameFailure, string> = {
  'unsafe-name':
    'that name cannot be a folder name, and the folder takes the name — drop the separators and the control characters rather than having the studio choose for the person',
  taken:
    'a folder beside it already carries that name, and the folder takes the name — pick another, or rename the one already there first',
}

export const FILE_HANDLERS: ActionHandlers = {
  // 🛑 `projectsByCreation`, the order the two shelves the person LOOKS at are drawn in — the
  // stored order reshuffles on every opening, and « the first one » must mean one row.
  'projects.list': () => ({
    ok: true,
    // The name is READ off the path, never stored beside it: one folder, one name — see
    // `projectName`. A model that rebuilt a path from a name got ENOENT.
    data: projectsByCreation(useSettings.getState().settings.storage.recentProjects).map(one => ({
      name: projectName(one.path),
      path: one.path,
    })),
  }),

  'project.open': openProject,
  'project.close': closeProject,
  'project.create': createProject,
  'project.forget': forgetProject,
  'project.trash': trashProject,
  'file.facts': facts,
  'file.open': openFile,

  'files.list': input =>
    inProject(bridge =>
      bridge.project.listFolder(textOf(input, 'folder') ?? FOLDER_ROOT, boolOf(input, 'hidden')),
    ),

  'files.search': input =>
    inProject(bridge =>
      bridge.project.searchFolder(textOf(input, 'query') ?? '', boolOf(input, 'hidden')),
    ),

  'files.move': input =>
    moving(input, (bridge, paths, folder) => bridge.project.moveFiles(paths, folder)),

  // `cut: false` is the copy. The channel is the Explorer's paste, which is why it takes a flag
  // rather than there being two of them.
  'files.copy': input =>
    moving(input, (bridge, paths, folder) => bridge.project.pasteFiles(paths, folder, false)),

  'files.duplicate': input =>
    changing(bridge => bridge.project.duplicateFiles(textsOf(input, 'paths'))),

  'files.trash': input => changing(bridge => bridge.project.trashFiles(textsOf(input, 'paths'))),

  'file.rename': input =>
    changing(bridge =>
      bridge.project.renameFile(textOf(input, 'path') ?? '', textOf(input, 'name') ?? ''),
    ),

  'folder.new': input =>
    changing(bridge =>
      bridge.project.newFolder(textOf(input, 'folder') ?? '', textOf(input, 'name') ?? ''),
    ),

  'files.undoFileOperation': () => changing(bridge => bridge.project.undoFile()),

  'files.redoFileOperation': () => changing(bridge => bridge.project.redoFile()),

  'files.canUndoRedo': () => inProject(bridge => bridge.project.fileHistory()),

  'file.reveal': input =>
    inProject(bridge => bridge.project.revealFile(textOf(input, 'path') ?? '')),

  /**
   * Through the store rather than the channel, and not `inProject`: the path is absolute and
   * names a project that need not be the open one. The store is what puts the new name on the
   * open project and in the recent list — the broadcast behind the channel reaches OTHER windows,
   * so the one that served this call would have kept the old name for good.
   */
  'project.rename': async input => {
    const path = textOf(input, 'path') ?? ''
    const renamed = await useProject.getState().rename(path, textOf(input, 'name') ?? '')

    return renamed.ok
      ? { ok: true, data: renamed.project }
      : refused('failed', renameProblem(path, renamed.why))
  },
}

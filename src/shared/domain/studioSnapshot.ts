import type { DocumentKind } from './document'
import type { PlayState } from './gameRuntime'
import type { Project } from './project'
import type { TargetKind } from './target'
import type { WorkspaceId } from './workspace'
import type { DocumentRevisionSnapshot, DocumentStateSnapshot } from './documentState'

/**
 * What `studio.state` answers: the studio as one reading, for whoever asked.
 *
 * 🛑 A shared type because it crosses TWO processes and is composed in one and read in the other
 * — invariant 2. Read key by key off `unknown`, a field renamed in the window left the main
 * process composing an empty sentence, and the model acting on a studio that is not there.
 *
 * Its two readers must see the same thing: an MCP client, which takes it as JSON, and the
 * assistant's own briefing, which turns it into sentences — see `describeStudio`.
 */

/** One document, as this reading names it. */
export type SnapshotDocument = {
  id: string
  title: string
  kind: DocumentKind
  workspace: WorkspaceId
  path: string | null
  active: boolean
  modified: boolean
}

/**
 * What is designated on the surface in front, in ONE shape whoever answers.
 *
 * Named things rather than ids alone: the briefing reads this as a sentence, and "one layer,
 * Background" is what makes a request about "the background" land on the right one. A clip has
 * no name of its own, so it stands under its id.
 */
export type SnapshotSelection = {
  kind: TargetKind
  items: { id: string; name: string }[]
}

/** How many running tasks the snapshot names. Beyond this the list is noise in a briefing. */
export const SNAPSHOT_TASKS_MAX = 4

/** One long task in flight here, as the studio publishes it. */
export type SnapshotTask = {
  id: string
  label: string
  /** 0 to 1 across the whole task. */
  ratio: number
}

export type StudioSnapshot = {
  project: Project | null
  /**
   * 🛑 Beside the project itself: its initial `null` in the window means "not asked yet", and a
   * reader that took it for an answer would tell a model there is no project over an open one.
   */
  projectKnown: boolean
  workspace: WorkspaceId
  /** The surface, and the scope it puts a command in — the two facts `command.runStudioCommand` refuses on. */
  surface: string
  /** `null` for a surface no command scope covers — the home, for one. */
  commandScope: string | null
  documents: SnapshotDocument[]
  activeDocumentState?: DocumentStateSnapshot
  documentRevisions?: DocumentRevisionSnapshot[]
  selection: SnapshotSelection | null
  /** Which model is armed per role, keyed by `AiRoleId`. Absent where nothing is armed. */
  armedModels: Partial<Record<string, string>>
  /**
   * 🛑 Whether a game is under way on the scene in front, and nothing more of it: the tick, the
   * rate and the faults are what `runtime.report` and `runtime.errors` answer, and repeated here
   * they would be read instead of called. Told nothing at all, a model asked « reprends la
   * partie » answered « Reprise de la partie. » without a single call — measured 2026-08-31.
   */
  play: PlayState
  /**
   * 🛑 The long tasks this window is running, with the id `task.cancelLocalTask` takes — nothing
   * else publishes one, so « arrête la tâche d'indexation qui tourne » had no id to name and the
   * model read `jobs.list`, which holds cloud generations and never a local task.
   */
  tasks: SnapshotTask[]
  authenticated: boolean
  /** Same reason as `projectKnown`: the window holds a separate flag for it. */
  authKnown: boolean
}

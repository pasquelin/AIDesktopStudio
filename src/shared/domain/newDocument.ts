import type { DocumentDescriptor, DocumentKind } from './document'
import type { RecentProject } from './project'
import type { SceneTemplateId } from './sceneTemplate'
import type { ToolSurface } from './tool'
import type { UiTemplateId } from './uiTemplates'

/** URL fragment that tells the shared bundle it is rendering the new-document window. */
export const NEW_DOCUMENT_ROUTE = 'new-document'

export function isNewDocumentRoute(hash: string): boolean {
  return hash.replace(/^#/, '') === NEW_DOCUMENT_ROUTE
}

/** What the studio hands the window that names a document about to be made. */
export type NewDocumentAsk = {
  /** A file arrival only asks where it belongs; it never asks for a document kind or name. */
  purpose?: 'externalFiles'
  /**
   * What is being made, or `null` to ask that first — the plus button and ⌘N send nothing,
   * a File ▸ New row sends its own kind. A window that already knows opens on the form.
   */
  kind: DocumentKind | null
  /**
   * Where the person was standing, which decides the ORDER the kinds are offered in. Never a
   * filter: everything is offered from everywhere, or this window puts the studio back where it
   * was, with the gesture depending on the screen one happens to be looking at.
   */
  surface: ToolSurface | null
  /**
   * The folder the Explorer is pointing at, or `null` to open on the kind's own folder. Resolved
   * by the studio because only it holds the selection — a row that is a FILE means the folder
   * holding it.
   */
  picked: string | null
  /**
   * The project's own name, which heads the first column of the picker — `null` where none is
   * open. One field rather than a name beside a boolean: two members saying the same thing are
   * two members free to disagree, and the window would dim its rows over an open project.
   */
  projectName: string | null
  /**
   * What has been opened before, so the window can offer a way in without a project. Carried
   * rather than read: the settings replicate to the studio's windows, and an auxiliary one holds
   * no subscription of its own — a list read there would be empty.
   */
  recentProjects: readonly RecentProject[]
  /**
   * The documents a tab holds and no file does yet: the window reads the project folder for
   * itself, and a name that exists only in a tab is nowhere on disk for it to find.
   */
  open: readonly DocumentDescriptor[]
}

/**
 * What a kind can open ON. Two families and no more, told apart by which kind is being named —
 * a union rather than a string, so a scene id cannot travel from the interface window.
 */
export type DocumentTemplateId = SceneTemplateId | UiTemplateId

/**
 * What a named document is to be: WHAT it is, where it goes, what it is called, and — for the two
 * kinds that offer one — what it opens on.
 *
 * The kind travels back because the window is where it is chosen: an ask carrying `null` is
 * answered by a person picking a row, and a studio deriving the kind again from the space it
 * happened to be showing would file that answer under the wrong one.
 *
 * `template` is absent for every other kind rather than defaulted here: only a window that DREW
 * the section answers with one, and a value travelling from a kind that showed none would be a
 * choice nobody made.
 */
export type NamedDocumentPlace = {
  kind: DocumentKind
  title: string
  folder: string
  template?: DocumentTemplateId
}

/**
 * What the window answers, which is not always a document.
 *
 * With no project open there is nowhere to write one, so the window offers the way in instead —
 * and asks the STUDIO to take it. Opening a project tears down panels, reloads a catalogue and
 * settles unsaved work; none of that can happen in an auxiliary window, and a second
 * implementation of it there is the very thing this union exists to prevent.
 *
 * `null`, on the wire beside these, stays what it always was: nothing is to be made.
 */
export type NewDocumentAnswer =
  | { answer: 'made'; place: NamedDocumentPlace }
  | { answer: 'newProject' }
  | { answer: 'openProject' }
  | { answer: 'recentProject'; path: string }

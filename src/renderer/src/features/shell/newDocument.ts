import { orElse } from '@shared/promises'
import {
  documentFolderOf,
  kindForWorkspace,
  workspaceForKind,
  type DocumentDescriptor,
  type DocumentKind,
} from '@shared/domain/document'
import type { ToolSurface } from '@shared/domain/tool'
import type { WorkspaceId } from '@shared/domain/workspace'
import {
  checkDocumentName,
  documentPathFor,
  type DocumentNameFailure,
} from '@shared/domain/documentName'
import { parentOf } from '@shared/domain/folder'
import { SCRIPT_STARTER } from '@shared/domain/game'
import { DEFAULT_SCENE_TEMPLATE, isSceneTemplateId } from '@shared/domain/sceneTemplate'
import type {
  DocumentTemplateId,
  NewDocumentAnswer,
  NewDocumentAsk,
} from '@shared/domain/newDocument'
import { DEFAULT_UI_TEMPLATE, isUiTemplateId } from '@shared/domain/uiTemplates'
import { ensureProjectInstalls } from '@/engines/scene/projectInstalls'
import { seedGuiTemplate } from '@/stores/gui'
import { seedSceneTemplate } from '@/stores/scenes'
import { documentAtPath, useDocuments } from '@/stores/documents'
import { takenDocumentNames } from '@/stores/documentNames'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { getBridge } from '@/services/bridge'
import { openDocument } from './components/dockviewApi'
import { projectName } from '@shared/domain/project'

/**
 * The file first, then the tab: `relist` is what gives the document the id its path spells.
 *
 * Exported for the one other thing that makes a script — a generation, which brings its own
 * source where a person's gesture brings the starter.
 */
export async function createScript(
  of: NamedCreation | undefined,
  source: string = SCRIPT_STARTER,
): Promise<DocumentDescriptor | null> {
  if (!of) return null

  // Composed like every other kind: from the RAW title, a separator named a file in another
  // folder, and a name the main process refuses made `writeScript` answer `false` — nothing on
  // screen, no word.
  const path = documentPathFor(of.title, 'script', of.folder)
  // Refused rather than overwritten: this path names a file somebody already has work in.
  if (documentAtPath(useDocuments.getState(), path)) return null
  if (!(await orElse(getBridge()?.game.writeScript(path, source), false))) return null

  await useDocuments.getState().relist()
  const created = documentAtPath(useDocuments.getState(), path)
  if (created) openDocument(created)
  return created
}

/**
 * The folder the Explorer points at, or `null` for the window to fall back on the kind's own.
 *
 * The DISK is asked which of the two a row is: a path alone cannot say, and a folder mistaken for
 * a file opens the field one level too high. Resolved here because only the studio has a selection.
 */
async function pickedFolder(): Promise<string | null> {
  const picked = selectedFilePaths(useSelection.getState()).at(-1)
  if (picked === undefined) return null

  const facts = await orElse(getBridge()?.project.fileFacts(picked), null)
  if (!facts) return null

  return facts.kind === 'folder' ? picked : (parentOf(picked) ?? null)
}

/** What the window is handed, read fresh every time it is asked — a project may have opened. */
async function askFor(
  kind: DocumentKind | null,
  surface: ToolSurface | null,
): Promise<NewDocumentAsk> {
  // The folders first: what they hold is what the suggested name has to step over.
  await useDocuments.getState().relist()
  const open = useProject.getState().project

  return {
    kind,
    surface,
    picked: await pickedFolder(),
    projectName: open ? projectName(open.path) : null,
    recentProjects: useSettings.getState().settings.storage.recentProjects,
    // The tabs, which the window cannot read: it lists the project FOLDER for itself, and a
    // document opened and never saved is in no folder to be found.
    open: Object.values(useDocuments.getState().documents),
  }
}

/**
 * The three ways into a project the window offers, taken HERE — leaving one tears down panels,
 * settles unsaved work and reloads a catalogue, none of which an auxiliary window can do.
 */
async function enterProject(given: NewDocumentAnswer): Promise<void> {
  const project = useProject.getState()

  if (given.answer === 'newProject') return await project.createPicked()
  if (given.answer === 'openProject') return await project.openPicked()
  if (given.answer === 'recentProject') await project.open(given.path)
}

/**
 * The same creation for a caller that has nobody to ask — the assistant, the MCP wire — refused
 * where the title it brings is one this folder already holds, or one the disk would rewrite.
 *
 * 🛑 `checkDocumentName`, the very guard the naming FIELD answers to: a caller that names its own
 * file never sees that field, and two tabs stood on `Scenes/3rd Person.gltf` on 2026-09-09, each
 * saving over the other. It folds case and NFC, which a raw path comparison does not — `niveau`
 * takes `Niveau.gltf` on APFS and NTFS alike.
 */
export async function createNamedDocumentIn(
  workspace: WorkspaceId,
  called: NamedCreation,
): Promise<DocumentDescriptor | DocumentNameFailure | null> {
  const kind = kindForWorkspace(workspace)
  if (kind === null) return null

  try {
    // The folder is listed first, for a file on disk no tab holds — one walk per creation, a
    // gesture measured in seconds.
    await useDocuments.getState().relist()
    const folder = called.folder ?? documentFolderOf(kind)
    const taken = takenDocumentNames(useDocuments.getState(), folder)

    return checkDocumentName(called.title, kind, taken) ?? (await create(kind, called))
  } catch {
    // As `createDocumentIn` answers: nothing was written, and the caller is told only that.
    return null
  }
}

/**
 * Asks WHAT to make before making it — the plus button, ⌘N, and the home's tiles. The surface
 * ORDERS the kinds and never filters them, or creating depends again on the screen one is on.
 */
export function openNewDocument(surface: ToolSurface | null): Promise<DocumentDescriptor | null> {
  return made(null, surface).catch(() => null)
}

/** One row of File ▸ New: the kind is named, the name and the folder are still asked. */
export function createDocumentOfKind(kind: DocumentKind): Promise<DocumentDescriptor | null> {
  return made(kind, workspaceForKind(kind)).catch(() => null)
}

/**
 * What a caller who has nobody to ask already knows. `template` is read for the two kinds that
 * open on one and ignored elsewhere — the assistant names one, and a caller that says nothing
 * takes the default. Narrowed by the kind at the seeding, never trusted on its face: the two
 * families share a field, and `empty` is the only id both of them spell.
 */
export type NamedCreation = { title: string; folder?: string; template?: DocumentTemplateId }

/**
 * Asks until there is an answer to act on: a way into a project is taken and the question put
 * again, so opening one does not cost the gesture that was being made. Every turn either makes a
 * document or reopens a window the person can close.
 */
async function made(
  kind: DocumentKind | null,
  surface: ToolSurface | null,
): Promise<DocumentDescriptor | null> {
  const namer = getBridge()?.newDocument
  if (!namer) return null

  for (;;) {
    const given = await namer.ask(await askFor(kind, surface))
    // Called off — the window was closed, or Cancel was pressed. Nothing is made, no tab and no
    // file, which is what cancelling has to mean.
    if (given === null) return null
    if (given.answer === 'made') return await create(given.place.kind, given.place)

    await enterProject(given)
  }
}

async function seedCreated(
  created: DocumentDescriptor,
  template: DocumentTemplateId | undefined,
  /** Everything the app ships that a template's shapes and modules read — awaited before seeding. */
  shipped: Promise<unknown>,
): Promise<void> {
  if (created.kind === 'scene') {
    await shipped
    const scene = isSceneTemplateId(template) ? template : DEFAULT_SCENE_TEMPLATE
    // Imported HERE, never at the top: this module opens the plus button, and what lays a
    // template's files down reaches the bridge and the document store — see `createDocumentIn`.
    const { seedTemplateFiles } = await import('@/features/game/seedTemplateFiles')
    // The files FIRST: they answer the folder the role resolved to, and the scene's `Script`
    // components must name the very paths that were just written.
    const seeded = await seedTemplateFiles(scene)
    seedSceneTemplate(created.id, scene, seeded.scripts, seeded.graph)
  }
  if (created.kind === 'gui') {
    seedGuiTemplate(created.id, isUiTemplateId(template) ? template : DEFAULT_UI_TEMPLATE)
  }
}

/** The document itself, once what it is and what it is called have both been settled. */
async function create(kind: DocumentKind, of: NamedCreation): Promise<DocumentDescriptor | null> {
  const project = useProject.getState().project
  if (!project) return null

  // 🛑 A script is written BEFORE it has a tab, and no other kind is: nothing in a `.ts` can
  // carry an id, so the file's own path IS the document's identity — a tab opened under a fresh
  // uuid would never find its file again, and every save would write a new one beside it.
  if (kind === 'script') return await createScript(of)

  const workspace = workspaceForKind(kind)
  if (workspace === null) return null

  // A round trip to the main process, started before the creation and awaited under the seeding
  // below — the shapes of a template are laid down before any editor mounts.
  const shipped = kind === 'scene' ? ensureProjectInstalls(project.path) : Promise.resolve()

  // The KIND travels: a space opens several, and its head is not always the one asked for.
  const created = await useDocuments.getState().create(workspace, { ...of, kind })
  if (!created) return null

  await seedCreated(created, of.template, shipped)

  openDocument(created)
  return created
}

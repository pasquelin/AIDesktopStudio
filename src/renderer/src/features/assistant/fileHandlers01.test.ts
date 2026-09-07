import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useProject, type ProjectLeft, type ProjectRenamed } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import type { FileFacts } from '@shared/domain/fileInfo'
import type { FileOutcome } from '@shared/domain/fileOp'
import { FOLDER_ROOT, type FolderEntry } from '@shared/domain/folder'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

/** A refusal as the store shapes it — the reason is what the sentences below are read from. */
const refusedRename = (why: string): ProjectRenamed => ({ ok: false, why })

const openDocument = vi.hoisted(() => vi.fn())
vi.mock('@/features/shell/components/dockviewApi', () => ({ openDocument, showWorkspace: vi.fn() }))

// The editor half of the gesture, held at its own tests: what `file.open` owes a caller is which
// of the three destinations took the file, not what the destination then did with it.
const openAsset = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/helpers/openAsset', () => ({ openAsset, openAssetById: vi.fn() }))

const WHEN = '2026-08-17T10:00:00.000Z'
const BATCH: FileOutcome = { done: [], refused: [], batch: 'batch-1' }

const relist = vi.fn(async () => {})

function withProject(overrides: BridgeOverrides = {}): void {
  installFakeBridge(overrides)
  useProject.setState({
    project: {
      path: '/tmp/Film',
      manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
    },
  })
}

beforeEach(() => {
  openDocument.mockClear()
  openAsset.mockClear()
  openAsset.mockResolvedValue(true)
  relist.mockClear()
  useDocuments.setState({ relist })
  withProject()
})

describe('walking the project folder', () => {
  it('lists a folder, and the project root when none is named', async () => {
    const entry: FolderEntry = { path: 'Plans', name: 'Plans', kind: 'folder' }
    const listFolder = vi.fn(async () => [entry])
    withProject({ project: { listFolder } })

    expect(await runAction('files.list', { folder: 'Plans' })).toEqual({ ok: true, data: [entry] })
    expect(listFolder).toHaveBeenCalledWith('Plans', false)

    await runAction('files.list', {})
    expect(listFolder).toHaveBeenCalledWith('', false)
  })

  it('searches the whole project by name', async () => {
    const searchFolder = vi.fn(async () => [])
    withProject({ project: { searchFolder } })

    await runAction('files.search', { query: 'niveau', hidden: true })
    expect(searchFolder).toHaveBeenCalledWith('niveau', true)
  })

  it('reads one entry’s facts, and refuses a path the disk does not hold', async () => {
    const facts: FileFacts = { kind: 'file', bytes: 12, createdAt: WHEN, modifiedAt: WHEN }
    withProject({ project: { fileFacts: vi.fn(async () => facts) } })
    expect(await runAction('file.facts', { path: 'Plans/a.png' })).toEqual({
      ok: true,
      data: facts,
    })

    withProject({ project: { fileFacts: vi.fn(async () => null) } })
    expect(await runAction('file.facts', { path: 'Plans/gone.png' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /**
   * Its own refusal, not `noBridge`: the two were answered together at first, which told a
   * client its window was unreachable when the real answer was that a relative path had nothing
   * to be relative to — and the two are fixed by opposite gestures.
   */
  it('refuses everything while no project is open, and says which of the two it is', async () => {
    installFakeBridge()
    useProject.setState({ project: null })

    expect(await runAction('files.list', {})).toMatchObject({ ok: false, refusal: 'noProject' })
    expect(await runAction('files.trash', { paths: ['a.png'] })).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
  })
})

describe('changing the project folder', () => {
  /**
   * The store learns of a batch through an event, but a client calling `files.list` in the very
   * next message would read the listing from before its own move — the round trip beats the
   * watcher. Awaiting the relist is what makes two consecutive calls agree.
   */
  it('re-reads the folder before answering, so the next listing sees the change', async () => {
    const moveFiles = vi.fn(async () => BATCH)
    withProject({ project: { moveFiles } })

    expect(await runAction('files.move', { paths: ['a.png'], folder: 'Plans' })).toEqual({
      ok: true,
      data: BATCH,
    })
    expect(moveFiles).toHaveBeenCalledWith(['a.png'], 'Plans')
    expect(relist).toHaveBeenCalledWith('own-write')
  })

  /**
   * The project ROOT is spelled `''`, and a required text may not be blank — so while `folder`
   * was required there was no spelling of "up to the root" a client could get through at all.
   */
  it('moves to the project root when no folder is named', async () => {
    const moveFiles = vi.fn(async () => BATCH)
    const newFolder = vi.fn(async () => BATCH)
    withProject({ project: { moveFiles, newFolder } })

    await runAction('files.move', { paths: ['Plans/a.png'] })
    await runAction('folder.new', { name: 'Nuit' })

    expect(moveFiles).toHaveBeenCalledWith(['Plans/a.png'], FOLDER_ROOT)
    expect(newFolder).toHaveBeenCalledWith(FOLDER_ROOT, 'Nuit')
  })

  it('copies through the Explorer’s paste, which is the same channel with the cut flag down', async () => {
    const pasteFiles = vi.fn(async () => BATCH)
    withProject({ project: { pasteFiles } })

    await runAction('files.copy', { paths: ['a.png'], folder: 'Plans' })
    expect(pasteFiles).toHaveBeenCalledWith(['a.png'], 'Plans', false)
  })

  it('bins, duplicates, renames and makes folders through their own channels', async () => {
    const trashFiles = vi.fn(async () => BATCH)
    const duplicateFiles = vi.fn(async () => BATCH)
    const renameFile = vi.fn(async () => BATCH)
    const newFolder = vi.fn(async () => BATCH)
    withProject({ project: { trashFiles, duplicateFiles, renameFile, newFolder } })

    await runAction('files.trash', { paths: ['a.png', 'b.png'] })
    await runAction('files.duplicate', { paths: ['a.png'] })
    await runAction('file.rename', { path: 'a.png', name: 'b.png' })
    await runAction('folder.new', { folder: 'Plans', name: 'Nuit' })

    expect(trashFiles).toHaveBeenCalledWith(['a.png', 'b.png'])
    expect(duplicateFiles).toHaveBeenCalledWith(['a.png'])
    expect(renameFile).toHaveBeenCalledWith('a.png', 'b.png')
    expect(newFolder).toHaveBeenCalledWith('Plans', 'Nuit')
  })

  it('refuses an empty list rather than calling the channel with one', async () => {
    const trashFiles = vi.fn(async () => BATCH)
    withProject({ project: { trashFiles } })

    expect(await runAction('files.trash', { paths: [] })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(trashFiles).not.toHaveBeenCalled()
  })
})

describe('opening and making a project', () => {
  /** 🛑 The half that was missing — see `fileActions.ts` for what it buys and what it costs. */
  it('answers the recent projects with the path project.open needs, as the studio shows them', async () => {
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          recentProjects: [
            { path: '/projets/Voilier', name: 'Voilier', openedAt: '2026-08-30T10:00:00.000Z' },
            { path: '/projets/Chantier', name: 'Chantier', openedAt: '2026-08-29T10:00:00.000Z' },
          ],
        },
      },
    }))

    expect(await runAction('projects.list', {})).toEqual({
      ok: true,
      data: [
        { name: 'Voilier', path: '/projets/Voilier' },
        { name: 'Chantier', path: '/projets/Chantier' },
      ],
    })
  })

  /**
   * The whole reason these exist beside the `project.new` and `project.open` COMMANDS: those
   * raise a system dialog nobody outside the machine can fill, so a client calling them hangs
   * the studio on a modal. These take the path.
   */
  it('opens a project from an absolute path, with no dialog raised', async () => {
    const open = vi.fn(async () => true)
    useProject.setState({ open })

    expect(await runAction('project.open', { path: '/tmp/Autre' })).toEqual({ ok: true })
    expect(open).toHaveBeenCalledWith('/tmp/Autre')
  })

  it('reports a folder that was no project as a refusal', async () => {
    useProject.setState({ open: vi.fn(async () => false) })

    expect(await runAction('project.open', { path: '/tmp/vide' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('closes the open project through the store the title bar closes it with', async () => {
    const close = vi.fn(async (): Promise<ProjectLeft> => 'left')
    useProject.setState({ close })

    expect(await runAction('project.close', {})).toEqual({ ok: true })
    expect(close).toHaveBeenCalled()
  })

  // Answered rather than done in silence: « ferme le projet » with none open is a person who
  // believes one is, and `ok` would leave them believing it.
  it('refuses to close when no project is open', async () => {
    const close = vi.fn(async (): Promise<ProjectLeft> => 'left')
    useProject.setState({ project: null, close })

    expect(await runAction('project.close', {})).toMatchObject({ ok: false, refusal: 'noProject' })
    expect(close).not.toHaveBeenCalled()
  })

  // The store asked about a document holding unsaved work and was told no. `badInput` would send
  // a client back to check parameters it got right.
  it('reports a cancelled question as a refusal by a person', async () => {
    useProject.setState({ close: async () => 'kept' })

    expect(await runAction('project.close', {})).toMatchObject({ ok: false, refusal: 'declined' })
  })

  // Created and then opened: a project nobody is in is a folder, and every other action of this
  // family would refuse on the very thing that was just made.
  it('opens what it just created', async () => {
    const created = {
      path: '/tmp/Neuf',
      manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
    }
    const createAt = vi.fn(async () => created)
    withProject()
    useProject.setState({ createAt })

    expect(await runAction('project.create', { name: '/tmp/Neuf' })).toEqual({
      ok: true,
      data: created,
    })
    expect(createAt).toHaveBeenCalledWith('/tmp/Neuf')
    expect(useProject.getState().project?.path).toBe('/tmp/Film')
  })

  /**
   * 🛑 A NAME is enough: asked for an absolute path, the model asked the PERSON to type one —
   * "quel chemin absolu pour le nouveau projet ?" is not a question anyone wants to answer.
   */
  it('puts a bare name where this person keeps projects', async () => {
    const createAt = vi.fn(async () => null)
    withProject()
    useProject.setState({ createAt })
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, projectsFolder: '/Users/someone/Mes Projets' },
      },
    }))

    await runAction('project.create', { name: 'test3' })

    expect(createAt).toHaveBeenCalledWith('/Users/someone/Mes Projets/test3')
  })

  // An absolute path still goes where it says: a model that knows the place names it.
  it('leaves an absolute path where it points', async () => {
    const createAt = vi.fn(async () => null)
    withProject()
    useProject.setState({ createAt })

    await runAction('project.create', { name: '/tmp/Ailleurs' })

    expect(createAt).toHaveBeenCalledWith('/tmp/Ailleurs')
  })

  /**
   * 🛑 `inputProblem` answers this, above the handler — the case is here because the sentence the
   * MODEL reads is what makes it repair rather than repeat, and nothing else in this file would
   * notice the field losing its `required`.
   */
  it('says which field is missing rather than refusing bare', async () => {
    withProject()

    expect(await runAction('project.create', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
      detail: expect.stringContaining('"name"'),
    })
  })
})

describe('creating and renaming a project', () => {
  /**
   * The first project of a machine: nothing says where projects go, and `~/Documents` is a place
   * nobody asked for. Refused, so the model asks the person instead — see the `ask` key.
   */
  it('refuses a bare name where no folder is known yet', async () => {
    withProject()
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, projectsFolder: undefined, recentProjects: [] },
      },
    }))

    expect(await runAction('project.create', { name: 'test3' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * The fourth way out of a project, and the one that used to slip past its questions: it called
   * the channel straight and left the open project without asking about anything.
   */
  it('reports a creation someone turned down as a refusal by a person', async () => {
    withProject()
    useProject.setState({ createAt: vi.fn(async () => null) })

    expect(await runAction('project.create', { name: '/tmp/Neuf' })).toMatchObject({
      ok: false,
      refusal: 'declined',
    })
  })

  /**
   * 🛑 A folder OF projects is not a project, and the studio names the new one inside it. Thrown
   * rather than answered, the verdict reached the turn as "the assistant could not answer that
   * one" — over a studio that had written the reason in its journal, and with nothing for the
   * model to repair from.
   */
  it('says what a folder already holding projects wants instead', async () => {
    withProject()
    useProject.setState({
      createAt: vi.fn(async () => {
        throw new Error("Error invoking remote method 'project:create': Error: holds-projects")
      }),
    })

    expect(await runAction('project.create', { name: '/tmp/Mes Projets' })).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('NAME'),
    })
  })

  /** A project inside a project gives the catalogue two owners for the same files. */
  it('says a folder under a project is not one to create in', async () => {
    withProject()
    useProject.setState({
      createAt: vi.fn(async () => {
        throw new Error('nested')
      }),
    })

    expect(await runAction('project.create', { name: '/tmp/Film/Plans' })).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('inside a project'),
    })
  })

  /** The manifest name AND the folder, which move together — see `stores/project.ts`. */
  it('renames a project by its own path, through the store the shelf reads', async () => {
    const renamed = {
      path: '/tmp/Autre',
      manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
    }
    const renamedOk: ProjectRenamed = { ok: true, project: renamed }
    const rename = vi.fn(async () => renamedOk)
    withProject()
    useProject.setState({ rename })

    expect(await runAction('project.rename', { path: '/tmp/Vieux', name: 'Autre' })).toEqual({
      ok: true,
      data: renamed,
    })
    // The store, never the channel: it is what puts the new name on the open project and in the
    // recent list — the broadcast behind the channel reaches OTHER windows only.
    expect(rename).toHaveBeenCalledWith('/tmp/Vieux', 'Autre')
  })

  /**
   * 🛑 Told only that it failed, the model announced to the person that no rename was needed —
   * over a path it had built from a NAME, which is not what the folder is called.
   */
  it('says which of the two the name broke, and where a path comes from', async () => {
    withProject()

    useProject.setState({ rename: vi.fn(async () => refusedRename('taken')) })
    expect(await runAction('project.rename', { path: '/tmp/X', name: 'X' })).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('already carries that name'),
    })

    useProject.setState({
      rename: vi.fn(async () => refusedRename('unsafe-name')),
    })
    expect(await runAction('project.rename', { path: '/tmp/X', name: 'a/b' })).toMatchObject({
      detail: expect.stringContaining('cannot be a folder name'),
    })

    useProject.setState({
      rename: vi.fn(async () => refusedRename('not-a-project')),
    })
    expect(await runAction('project.rename', { path: '/tmp/X', name: 'X' })).toMatchObject({
      detail: expect.stringContaining('projects.list'),
    })
  })
})

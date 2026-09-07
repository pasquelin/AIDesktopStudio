import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useProject, type ProjectTrashed } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import type { Asset } from '@shared/domain/asset'
import type { ActionName } from '@shared/domain/assistant'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { FileFacts } from '@shared/domain/fileInfo'
import type { FileOutcome } from '@shared/domain/fileOp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

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

describe('the file undo stack, which lives in the main process', () => {
  it('takes the last batch back and puts it back again', async () => {
    const undoFile = vi.fn(async () => BATCH)
    const redoFile = vi.fn(async () => BATCH)
    withProject({ project: { undoFile, redoFile } })

    expect(await runAction('files.undoFileOperation', {})).toEqual({ ok: true, data: BATCH })
    expect(await runAction('files.redoFileOperation', {})).toEqual({ ok: true, data: BATCH })
    // The listing a write owes its next reader: a client asking straight after would otherwise
    // read the folder from before its own undo.
    expect(relist).toHaveBeenCalledTimes(2)
  })

  it('says whether either gesture would do anything, without attempting one', async () => {
    const history = { undo: true, redo: false }
    const fileHistory = vi.fn(async () => history)
    withProject({ project: { fileHistory } })

    expect(await runAction('files.canUndoRedo', {})).toEqual({ ok: true, data: history })
    expect(relist).not.toHaveBeenCalled()
  })

  it('shows a file in the system file manager', async () => {
    const revealFile = vi.fn(async () => {})
    withProject({ project: { revealFile } })

    expect(await runAction('file.reveal', { path: 'Plans/a.png' })).toMatchObject({ ok: true })
    expect(revealFile).toHaveBeenCalledWith('Plans/a.png')
  })

  it('refuses every one of them with no project to be relative to', async () => {
    installFakeBridge()
    useProject.setState({ project: null })

    expect(await runAction('files.undoFileOperation', {})).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
    expect(await runAction('files.canUndoRedo', {})).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
  })
})

/**
 * The Explorer's double-click, reachable by name — the gesture that was missing altogether: a
 * picture of the project folder is no document, so `document.open` refused every one of them and
 * nothing else offered to open it.
 */
describe('opening a file of the project', () => {
  const FILE: FileFacts = { kind: 'file', bytes: 12, createdAt: WHEN, modifiedAt: WHEN }

  const picture: Asset = {
    id: 'asset-1',
    name: 'Voilier vert',
    type: 'image',
    location: 'local',
    path: 'Images/Voilier vert.png',
    tags: [],
    createdAt: WHEN,
  }

  const stored = (path: string): DocumentDescriptor => ({
    id: 'doc-1',
    kind: 'scene',
    workspace: '3d',
    title: 'Niveau',
    path,
  })

  it('brings a document of the folder to its tab', async () => {
    withProject()
    useDocuments.setState({ stored: [stored('documents/Niveau.gltf')], documents: {} })

    expect(await runAction('file.open', { path: 'documents/Niveau.gltf' })).toEqual({
      ok: true,
      data: { opened: 'document' },
    })
    expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }))
  })

  it('adopts a picture the catalogue has never heard of, and opens it', async () => {
    const adopt = vi.fn(async () => picture)
    withProject({ media: { adopt } })
    useDocuments.setState({ stored: [], documents: {} })

    expect(await runAction('file.open', { path: 'Images/Voilier vert.png' })).toEqual({
      ok: true,
      data: { opened: 'asset' },
    })
    expect(adopt).toHaveBeenCalledWith('Images/Voilier vert.png')
    expect(openAsset).toHaveBeenCalledWith(picture)
    // No re-walk of the project: a listing holds documents alone, so it could not have answered
    // for a `.png` however fresh it was.
    expect(relist).not.toHaveBeenCalled()
  })

  // A `.txt` and a `.pdf` have no editor here, and pretending otherwise would be worse than
  // opening them outside — but the answer says which of the two happened.
  it('hands a file no editor here takes to the system, and says so', async () => {
    const openFile = vi.fn(async () => true)
    withProject({ project: { fileFacts: vi.fn(async () => FILE), openFile } })
    useDocuments.setState({ stored: [], documents: {} })

    expect(await runAction('file.open', { path: 'documents/Notes.txt' })).toEqual({
      ok: true,
      data: { opened: 'system' },
    })
    expect(openFile).toHaveBeenCalledWith('documents/Notes.txt')
  })

  /**
   * 🛑 The one that must not fall through: a path nobody holds used to end at the system, which
   * opens whatever the spelling happens to hit — or nothing at all, silently.
   *
   * `adopt` REJECTS here rather than answering `null`, which is what the real channel does: it
   * stats the file itself and lets ENOENT through. Written the other way, this case passed while
   * a model's misspelled name was answered `failed` — "the studio broke", not "no such file".
   */
  it('refuses a path the project does not hold, without handing it to the system', async () => {
    const openFile = vi.fn(async () => true)
    withProject({
      media: { adopt: vi.fn(() => Promise.reject(new Error('ENOENT'))) },
      project: { fileFacts: vi.fn(async () => null), openFile },
    })
    useDocuments.setState({ stored: [], documents: {} })

    expect(await runAction('file.open', { path: 'Images/Absent.png' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(openFile).not.toHaveBeenCalled()
  })

  // `shell.openPath` answers with a sentence when it refuses, and the channel turns that into
  // `false`. Reported as `ok`, a model tells the person about a file nothing happened to.
  it('does not call a refused system open a success', async () => {
    const FILE: FileFacts = { kind: 'file', bytes: 12, createdAt: WHEN, modifiedAt: WHEN }
    withProject({
      project: { fileFacts: vi.fn(async () => FILE), openFile: vi.fn(async () => false) },
    })
    useDocuments.setState({ stored: [], documents: {} })

    expect(await runAction('file.open', { path: 'documents/Notes.txt' })).toMatchObject({
      ok: false,
      refusal: 'failed',
    })
  })

  it('refuses a folder, which is opened by listing it', async () => {
    const folder: FileFacts = { ...FILE, kind: 'folder' }
    withProject({ project: { fileFacts: vi.fn(async () => folder) } })
    useDocuments.setState({ stored: [], documents: {} })

    expect(await runAction('file.open', { path: 'Images' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  // The same re-read `document.open` does: a client's listing may predate a file that has since
  // arrived, and refusing one that sits on the disk is the least useful answer there is.
  it('re-reads the folder before deciding a path is unknown to it', async () => {
    withProject()
    useDocuments.setState({ stored: [], documents: {} })

    await runAction('file.open', { path: 'documents/Niveau.gltf' })
    expect(relist).toHaveBeenCalled()
  })

  it('refuses with no project for the path to be relative to', async () => {
    installFakeBridge()
    useProject.setState({ project: null })

    expect(await runAction('file.open', { path: 'Images/a.png' })).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
  })
})

/**
 * 🛑 The pair a model must not mix up. `project.forget` drops a ROW off the shelf; `project.trash`
 * bins the FOLDER. Told « retire jeu2 » with neither of them published, the model answered that
 * the project was not among the recent ones — it was, on screen — measured 2026-08-31.
 */
describe('telling forgetting a project from binning one', () => {
  const SHELVED = [
    { path: '/projets/Voilier', openedAt: '2026-08-30T10:00:00.000Z' },
    { path: '/projets/Chantier', openedAt: '2026-08-29T10:00:00.000Z' },
  ]

  const binned = (trashed: boolean): ProjectTrashed => ({ ok: true, trashed })

  beforeEach(() => {
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, recentProjects: SHELVED },
      },
    }))
  })

  it('drops the row through the store both shelves read', async () => {
    const forget = vi.fn(async () => {})
    useProject.setState({ forget })

    expect(await runAction('project.forget', { path: '/projets/Voilier' })).toEqual({ ok: true })
    expect(forget).toHaveBeenCalledWith('/projets/Voilier')
  })

  const PAIR: readonly ActionName[] = ['project.forget', 'project.trash']

  it.each(PAIR)(
    'refuses %s on a path no shelf holds, and says where a path comes from',
    async name => {
      const forget = vi.fn(async () => {})
      const trash = vi.fn(async () => binned(true))
      useProject.setState({ forget, trash })

      expect(await runAction(name, { path: '/projets/Inconnu' })).toMatchObject({
        ok: false,
        refusal: 'notFound',
        detail: expect.stringContaining('projects.list'),
      })
      expect(forget).not.toHaveBeenCalled()
      expect(trash).not.toHaveBeenCalled()
    },
  )

  /**
   * 🛑 `trashed: false` is the disk having already lost the folder, and it must not read like the
   * binning above it: a model told `ok` alone reports a folder in the trash where there is none.
   */
  it.each([true, false])('bins the folder and says whether it went (%s)', async went => {
    const trash = vi.fn(async () => binned(went))
    useProject.setState({ trash })

    expect(await runAction('project.trash', { path: '/projets/Voilier' })).toEqual({
      ok: true,
      data: { path: '/projets/Voilier', trashed: went },
    })
    expect(trash).toHaveBeenCalledWith('/projets/Voilier')
  })

  // The person kept their project, which is not a failure — a model told "could not" tries again.
  it('answers declined when the person kept the project', async () => {
    useProject.setState({ trash: async () => ({ ok: false, declined: true, why: null }) })

    expect(await runAction('project.trash', { path: '/projets/Voilier' })).toMatchObject({
      ok: false,
      refusal: 'declined',
      detail: expect.stringContaining('kept the project'),
    })
  })

  // 🛑 The REASON travels, as a refused rename's does: told only that it failed, the model made
  // one up and announced it to the person.
  it('carries why the folder would not go, and where a path comes from', async () => {
    useProject.setState({ trash: async () => ({ ok: false, declined: false, why: 'EPERM' }) })

    const outcome = await runAction('project.trash', { path: '/projets/Voilier' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'failed' })
    const detail = outcome.ok ? '' : (outcome.detail ?? '')
    expect(detail).toContain('EPERM')
    expect(detail).toContain('projects.list')
  })
})

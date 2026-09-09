import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { PENDING_FILES_FILE } from '@shared/domain/project'
import { createFileOps, type FileOps } from './fileOps'
import { createFolderReader, createFolderWriter } from './folder'
import { withTempProject } from './project-fixtures'
import type { AsyncCatalog } from './catalogClient'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-1',
  name: 'Boulder',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-16T10:00:00.000Z',
  ...overrides,
})

const inFrench = (): string => 'fr'

type Harness = {
  files: FileOps
  root: string
  catalog: AsyncCatalog
  trashed: string[]
  assetsChanged: ReturnType<typeof vi.fn>
  pathsChanged: ReturnType<typeof vi.fn>
}

/**
 * A real project folder, with the trash doubled.
 *
 * `shell.trashItem` needs a live app and would put real files in the user's own trash — but it
 * DOES take them off the folder, so the double removes them too. A double that only wrote down
 * what it was handed would leave every case below running against files the studio believes are
 * gone, and the undo cases are exactly about what is no longer there.
 */
async function harness(): Promise<Harness> {
  const { root, catalog } = await withTempProject()
  const trashed: string[] = []
  const assetsChanged = vi.fn()
  const pathsChanged = vi.fn()

  const folder = {
    ...createFolderReader(() => root, inFrench),
    ...createFolderWriter(
      () => root,
      async file => {
        trashed.push(file)
        await rm(file, { recursive: true, force: true })
      },
    ),
  }

  const files = createFileOps({
    rootOf: () => root,
    folder,
    catalog: () => catalog,
    newBatchId: () => 'batch-1',
    assetsChanged,
    pathsChanged,
  })

  return { files, root, catalog, trashed, assetsChanged, pathsChanged }
}

/** File operations over a root that may move or go away, with its own trash double. */
const fileOpsOn = (
  rootOf: () => string | null,
  catalog: () => AsyncCatalog,
  trash: (file: string) => Promise<void>,
): FileOps =>
  createFileOps({
    rootOf,
    folder: {
      ...createFolderReader(() => rootOf() ?? '', inFrench),
      ...createFolderWriter(() => rootOf() ?? '', trash),
    },
    catalog,
    newBatchId: () => 'batch-1',
    assetsChanged: vi.fn(),
    pathsChanged: vi.fn(),
  })

const namesIn = async (root: string, folder = ''): Promise<string[]> =>
  (await readdir(join(root, folder))).sort()

let harnessed: Harness

beforeEach(async () => {
  harnessed = await harness()
  await writeFile(join(harnessed.root, 'brief.pdf'), 'notes')
  await mkdir(join(harnessed.root, 'Rushes'))
})

describe('moving a batch', () => {
  /**
   * The result the whole shape exists for: a partial one. Two hundred and ninety-eight rushes
   * moved and two names already taken is what a file browser answers, where a throw would have
   * undone the lot over them.
   */
  it('moves what it can and reports what it would not, in one answer', async () => {
    const { files, root } = harnessed
    await writeFile(join(root, 'Rushes', 'brief.pdf'), 'already here')
    await writeFile(join(root, 'notes.txt'), 'x')

    const outcome = await files.move(['brief.pdf', 'notes.txt'], 'Rushes')

    expect(outcome.done).toEqual([{ from: 'notes.txt', to: 'Rushes/notes.txt' }])
    expect(outcome.refused).toEqual([{ path: 'brief.pdf', reason: 'exists' }])
    expect(await namesIn(root, 'Rushes')).toEqual(['brief.pdf', 'notes.txt'])
  })

  /**
   * The catalogue follows the disk, which is the half `folder.ts` deliberately knows nothing
   * about — and the reason this orchestrator exists at all.
   */
  it('takes the catalogue rows along, and clears the journal once it has', async () => {
    const { files, root, catalog } = harnessed
    await writeFile(join(root, 'Boulder.png'), 'bytes')
    await catalog.add(asset({ path: 'Boulder.png' }))

    await files.move(['Boulder.png'], 'Rushes')

    expect((await catalog.find('asset-1'))?.path).toBe('Rushes/Boulder.png')
    // Left behind, the journal would replay a move already made on the next opening. Harmless by
    // construction, and still a file saying work is pending when none is.
    await expect(readFile(join(root, PENDING_FILES_FILE), 'utf8')).rejects.toThrow()
  })
})

describe('duplicating', () => {
  it('lays a copy beside the original under a free name, catalogue untouched', async () => {
    const { files, root, catalog } = harnessed
    await writeFile(join(root, 'Boulder.png'), 'bytes')
    await catalog.add(asset({ path: 'Boulder.png' }))

    const outcome = await files.duplicate(['Boulder.png'])

    expect(outcome.done).toEqual([{ from: '', to: 'Boulder 2.png' }])
    expect(await readFile(join(root, 'Boulder 2.png'), 'utf8')).toBe('bytes')
    // A copy is bytes nobody has catalogued: inventing a row here would be inventing an identity
    // for it, and that is the reconciliation pass's to find.
    expect((await catalog.find('asset-1'))?.path).toBe('Boulder.png')
  })
})

describe('trashing', () => {
  /**
   * The row is dated, not dropped: `shell.trashItem` is reversible, and a file taken back out of
   * the trash must come back with its prompt and its lineage rather than as bytes nobody knows.
   * It leaves every listing all the same — what is not there is not shown.
   */
  it('hands the file to the system and takes the rows underneath out of every listing', async () => {
    const { files, root, catalog, trashed, assetsChanged } = harnessed
    await catalog.add(asset({ path: 'Rushes/A001.mov' }))

    const outcome = await files.trash(['Rushes'])

    expect(trashed).toEqual([join(root, 'Rushes')])
    expect(outcome.done).toEqual([{ from: 'Rushes', to: '' }])
    expect(await catalog.search({})).toEqual([])
    expect(await catalog.find('asset-1')).not.toBeNull()
    expect(assetsChanged).toHaveBeenCalled()
  })

  // A `.pdf` of storyboard notes has no row, and telling every window to walk its shelf over it
  // is a folder walk for nothing.
  it('says nothing to the shelves when the catalogue lost nothing', async () => {
    const { files, assetsChanged } = harnessed

    await files.trash(['brief.pdf'])

    expect(assetsChanged).not.toHaveBeenCalled()
  })

  /** 🛑 What ACTUALLY moved, not what was asked: a refused move must not be followed anywhere. */
  it('tells what references a file by path what really happened', async () => {
    const { files, pathsChanged } = harnessed

    await files.move(['brief.pdf'], 'Rushes')

    expect(pathsChanged).toHaveBeenCalledWith([{ from: 'brief.pdf', to: 'Rushes/brief.pdf' }])
  })
})

describe('taking a batch back', () => {
  it('puts a move back where it came from, and does it again on redo', async () => {
    const { files, root } = harnessed
    await files.move(['brief.pdf'], 'Rushes')

    await files.undo()
    expect(await namesIn(root, 'Rushes')).toEqual([])

    await files.redo()
    expect(await namesIn(root, 'Rushes')).toEqual(['brief.pdf'])
  })

  /**
   * The decision this holds, and the one a reader is most likely to undo by accident: the trash
   * pushes nothing on the stack — `shell.trashItem` offers no portable way back — and it clears
   * what was taken back, so nothing can be redone across a deletion either.
   */
  it('gives nothing back after a deletion, in either direction', async () => {
    const { files, root } = harnessed
    await files.move(['brief.pdf'], 'Rushes')
    await files.undo()
    // Something to redo, so the clearing below is what the deletion does rather than a stack
    // that was empty anyway.
    expect(files.can().redo).toBe(true)

    await files.trash(['brief.pdf'])

    expect(files.can().redo).toBe(false)
    expect((await files.redo()).done).toEqual([])
    // And the file itself does not come back: undoing the move that put it there finds nothing
    // to move, which is the whole of why the trash stays out of the stack.
    expect((await files.undo()).done).toEqual([])
    expect(await namesIn(root, 'Rushes')).toEqual([])
  })

  /**
   * A batch that could not be replayed leaves both piles as it found them, minus itself: it
   * cannot be replayed on the next press either, and an empty batch pushed across would light
   * « Rétablir » for an action that does not exist — then « Annuler » again when pressed.
   */
  it('lights nothing when the file it would put back has gone from outside', async () => {
    const { files, root } = harnessed
    await files.move(['brief.pdf'], 'Rushes')
    await rm(join(root, 'Rushes', 'brief.pdf'))

    expect((await files.undo()).done).toEqual([])

    expect(files.can()).toEqual({ undo: false, redo: false })
  })

  it('takes a created folder away again', async () => {
    const { files, root, trashed } = harnessed
    await files.createFolder('', 'Characters')

    await files.undo()

    expect(trashed).toEqual([join(root, 'Characters')])
  })

  it('answers an empty batch when there is nothing left to take back', async () => {
    const { files } = harnessed

    expect((await files.undo()).done).toEqual([])
    expect(files.can()).toEqual({ undo: false, redo: false })
  })

  /**
   * A stack belongs to one project: its paths mean nothing in another folder. Most of a replayed
   * batch would find nothing there — and the one path both projects happen to share would move
   * for no reason anybody could explain.
   */
  it.each(['another', 'none'])('drops what it held when the project becomes %s', async how => {
    const { root, catalog, trashed } = harnessed
    let current: string | null = root
    const files = fileOpsOn(
      () => current,
      () => catalog,
      async file => void trashed.push(file),
    )

    await files.move(['brief.pdf'], 'Rushes')
    expect(files.can().undo).toBe(true)

    current = how === 'none' ? null : (await withTempProject('Other')).root

    expect(files.can().undo).toBe(false)
    expect((await files.undo()).done).toEqual([])
  })

  // A batch that moved `a` out of the way and then `b` into its place has to come back in the
  // other order, or the second inverse lands on a name the first has not freed yet.
  it('replays the inverses in reverse, so one batch does not collide with itself', async () => {
    const { files, root } = harnessed
    await writeFile(join(root, 'Rushes', 'x.txt'), 'inner')
    await writeFile(join(root, 'x.txt'), 'outer')

    // `Rushes/x.txt` leaves first, then `x.txt` takes the name it freed.
    await files.move(['Rushes/x.txt'], '')
    const second = await files.move(['x.txt'], 'Rushes')
    expect(second.done).toEqual([])

    await files.undo()
    expect(await readFile(join(root, 'x.txt'), 'utf8')).toBe('outer')
  })
})

describe('retargeting a motion that changed folder', () => {
  it('retypes an FBX moved from Models to Animations', async () => {
    const { files, root, catalog } = harnessed
    await mkdir(join(root, 'Models'), { recursive: true })
    await mkdir(join(root, 'Animations'), { recursive: true })
    await writeFile(join(root, 'Models/walk.fbx'), 'clip')
    await catalog.add(
      asset({
        id: 'asset-walk',
        name: 'walk',
        type: 'mesh',
        path: 'Models/walk.fbx',
      }),
    )

    await files.move(['Models/walk.fbx'], 'Animations')

    expect(await catalog.find('asset-walk')).toMatchObject({
      path: 'Animations/walk.fbx',
      type: 'animation',
    })
  })

  it('retypes every clip inside a folder dragged onto Animations', async () => {
    const { files, root, catalog } = harnessed
    await mkdir(join(root, 'Models/mixamo'), { recursive: true })
    await mkdir(join(root, 'Animations'), { recursive: true })
    await writeFile(join(root, 'Models/mixamo/walk.fbx'), 'clip')
    await catalog.add(
      asset({
        id: 'asset-walk',
        name: 'walk',
        type: 'mesh',
        path: 'Models/mixamo/walk.fbx',
      }),
    )

    await files.move(['Models/mixamo'], 'Animations')

    expect(await catalog.find('asset-walk')).toMatchObject({
      path: 'Animations/mixamo/walk.fbx',
      type: 'animation',
    })
  })

  it('files a picture dragged onto Skyboxes as a skybox, and back as a picture', async () => {
    const { files, root, catalog } = harnessed
    await mkdir(join(root, 'Images'), { recursive: true })
    await mkdir(join(root, 'Skyboxes'), { recursive: true })
    await writeFile(join(root, 'Images/noon.png'), 'sky')
    await catalog.add(asset({ id: 'asset-noon', name: 'noon', path: 'Images/noon.png' }))

    await files.move(['Images/noon.png'], 'Skyboxes')
    expect(await catalog.find('asset-noon')).toMatchObject({
      path: 'Skyboxes/noon.png',
      type: 'skybox',
    })

    await files.move(['Skyboxes/noon.png'], 'Images')
    expect(await catalog.find('asset-noon')).toMatchObject({
      path: 'Images/noon.png',
      type: 'image',
    })
  })
})

describe('with no project open', () => {
  it('answers an empty batch rather than resolving a path against nothing', async () => {
    const files = fileOpsOn(
      () => null,
      () => harnessed.catalog,
      async () => {},
    )

    expect(await files.move(['a.png'], 'refs')).toEqual({
      done: [],
      refused: [],
      batch: 'batch-1',
    })
  })
})

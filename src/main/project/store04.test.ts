import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MANIFEST_FILE, projectName } from '@shared/domain/project'

import {
  createProjectStore,
  ProjectOpenError,
  ProjectRenameError,
  type ProjectStore,
} from './store'

import { memoryCatalog } from './catalog-fixtures'

type ExecDone = (error: Error | null, stdout: string, stderr: string) => void

/** Hoisted: `hideFromExplorer.ts` promisifies `execFile` as it loads, before a `beforeEach` runs. */
const execFileMock = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], done: ExecDone) => {
    done(null, '', '')
  }),
)

vi.mock('node:child_process', () => ({ execFile: execFileMock }))

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('renaming a project', () => {
  let root: string

  let onChange: (project: unknown) => void

  let store: ProjectStore

  let clock: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scenario-rename-'))
    onChange = vi.fn()
    clock = '2026-08-13T10:00:00.000Z'
    store = createProjectStore({
      openCatalog: async () => memoryCatalog(),
      now: () => clock,
      onChange,
      onRoles: () => {},
    })
  })

  afterEach(async () => {
    await store.close()
    await rm(root, { recursive: true, force: true })
    execFileMock.mockClear()
  })

  const manifestAt = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(join(path, MANIFEST_FILE), 'utf8'))

  it('moves the folder to the new name, and writes it into the manifest', async () => {
    const made = await store.create(join(root, 'Before'))

    const renamed = await store.rename(made.path, 'After')

    expect(renamed.path).toBe(join(root, 'After'))
    expect(projectName(renamed.path)).toBe('After')
    expect(await exists(made.path)).toBe(false)
    // The manifest carries no name at all: the folder is the only place it lives.
    expect(await manifestAt(renamed.path)).not.toHaveProperty('name')
  })

  /**
   * `createdAt` is what both surfaces ORDER the projects by since 13 August. A rename that stamped
   * it would move the row it renamed to the top of the list — the exact reshuffle that key exists
   * to prevent, arriving through the one gesture that reads as harmless.
   */
  it('never touches the date the project was made', async () => {
    const made = await store.create(join(root, 'Before'))
    clock = '2026-12-25T00:00:00.000Z'

    const renamed = await store.rename(made.path, 'After')

    expect(renamed.manifest.createdAt).toBe(made.manifest.createdAt)
    expect(renamed.manifest.updatedAt).toBe('2026-12-25T00:00:00.000Z')
  })

  it('replaces the open project in memory, so the studio reads the new name at once', async () => {
    const made = await store.create(join(root, 'Before'))

    const renamed = await store.rename(made.path, 'After')

    expect(projectName(store.current()?.path ?? '')).toBe('After')
    expect(store.current()?.path).toBe(renamed.path)
  })

  /**
   * 🛑 The catalogue is a thread holding a file INSIDE the folder that just moved. Reopened rather
   * than left pointing at the old path — and Windows would not have let the folder move at all.
   */
  it('answers from the catalogue of the folder it moved to', async () => {
    const made = await store.create(join(root, 'Before'))

    await store.rename(made.path, 'After')

    await expect(store.catalog().search({})).resolves.toEqual([])
  })

  /**
   * 🛑 Announced, and staying silent cost more than it saved: `onChange` is the only thing that
   * redirects the folder watch, follows the assistant's memory and re-keys the account link — all
   * of which stayed on a folder that had just moved.
   */
  it('announces the folder it moved to, for everything keyed on the old one', async () => {
    const made = await store.create(join(root, 'Before'))
    vi.mocked(onChange).mockClear()

    const renamed = await store.rename(made.path, 'After')

    expect(onChange).toHaveBeenCalledWith(renamed)
  })

  // The home's shelf lists projects that are not open, and renaming one must not open it.
  it('renames a project that is not open, without opening it', async () => {
    const other = await store.create(join(root, 'other'))
    const open = await store.create(join(root, 'open'))

    const renamed = await store.rename(other.path, 'Renamed')

    expect(projectName(renamed.path)).toBe('Renamed')
    // Still the one that was open, and its folder untouched.
    expect(store.current()?.path).toBe(open.path)
    expect(projectName(open.path)).toBe('open')
  })

  /**
   * 🛑 Measured by inode, never deduced: APFS and NTFS fold case where ext4 does not, so `jeu1` →
   * `Jeu1` is a plain rename on this Mac and « that name is taken » on a Linux runner — and
   * `process.platform` answers for neither, since the volume is what decides.
   */
  it('takes a name that differs only in case', async () => {
    const made = await store.create(join(root, 'jeu1'))

    const renamed = await store.rename(made.path, 'Jeu1')

    expect(projectName(renamed.path)).toBe('Jeu1')
    expect(await exists(renamed.path)).toBe(true)
  })

  it('refuses a name a folder beside it already carries', async () => {
    await store.create(join(root, 'Taken'))
    const made = await store.create(join(root, 'Before'))

    await expect(store.rename(made.path, 'Taken')).rejects.toThrow(ProjectRenameError)
    expect(await exists(made.path)).toBe(true)
  })

  // Refused rather than transformed: a studio that quietly renamed « Brique 1/2 » to « Brique 1 2 »
  // would list a project under a name nobody typed.
  it('refuses a name the disk cannot carry', async () => {
    const made = await store.create(join(root, 'Before'))

    await expect(store.rename(made.path, 'Brique 1/2')).rejects.toThrow(ProjectRenameError)
    expect(await exists(made.path)).toBe(true)
  })

  // A folder gone since the shelf last saw it is the ordinary case there, and it must not be
  // reported as anything other than what opening it would report.
  it('refuses a folder that is not a project', async () => {
    await expect(store.rename(join(root, 'nowhere'), 'Name')).rejects.toThrow(ProjectOpenError)
  })
})

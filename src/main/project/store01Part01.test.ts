import { mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MACHINE_FOLDERS } from '@shared/domain/project'

import { DEFAULT_ROLE_PATHS, ROLE_MARKER } from '@shared/domain/folderRole'

import { createProjectStore, type ProjectStore } from './store'

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

describe('project store', () => {
  let root: string

  let onChange: (project: unknown) => void

  let store: ProjectStore

  let clock: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-project-'))
    onChange = vi.fn()
    clock = '2026-08-06T10:00:00.000Z'
    store = createProjectStore({
      // In memory: the catalogue's own tests cover the SQL, and a project test has no reason
      // to leave a database file behind.
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

  it('creates the whole tree and its manifest', async () => {
    const project = await store.create(root)

    // The folder handed in IS the project. Nothing is made from the name — a name that fabricated
    // a subfolder put a project inside the folder the user had just made for it.
    expect(project.path).toBe(root)
    for (const folder of [...MACHINE_FOLDERS, ...Object.values(DEFAULT_ROLE_PATHS)]) {
      expect(await exists(join(project.path, folder))).toBe(true)
    }

    // The old layout is gone: a document lands in `documents/` when nothing says otherwise and
    // the folder appears with the first save, exactly as an import recreates `Images/`.
    expect(await exists(join(project.path, 'assets'))).toBe(false)
    expect(await exists(join(project.path, 'documents'))).toBe(false)

    const manifest: unknown = JSON.parse(
      await readFile(join(project.path, '.project.json'), 'utf8'),
    )
    expect(manifest).toEqual({
      version: 1,
      createdAt: '2026-08-06T10:00:00.000Z',
      updatedAt: '2026-08-06T10:00:00.000Z',
    })
  })

  // The rule the entry states: what the folder holds for the user stays in the open, what the
  // machine keeps goes under a dot. `layouts/` was neither — nothing has ever written to it.
  it('says what each folder it laid down is for, so a rename cannot lose one', async () => {
    const project = await store.create(root)

    expect(await readFile(join(project.path, 'Models', ROLE_MARKER), 'utf8')).toBe('models\n')
  })

  /**
   * 🛑 What the manual promises, and it has to hold WITHOUT closing the project: renaming a role
   * folder while it is open once left the map naming where it used to be, so the next write laid
   * the default back down and orphaned the folder the user had just renamed, marker and all.
   */
  it('follows a role folder renamed while the project is open', async () => {
    const project = await store.create(root)
    await rename(join(project.path, 'Images'), join(project.path, 'Mes photos'))

    expect(await store.folderFor('image')).toBe('Mes photos')
    expect(await exists(join(project.path, 'Images'))).toBe(false)
  })

  it('empties the roles with the project, so none answers for a folder nobody has open', async () => {
    await store.create(root)
    await store.close()

    expect(store.roles()).toEqual({})
  })
})

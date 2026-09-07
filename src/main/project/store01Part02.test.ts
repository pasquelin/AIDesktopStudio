import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MANIFEST_FILE, MACHINE_FOLDERS, projectName } from '@shared/domain/project'

import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'

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

  it('leaves no folder behind that nothing writes to', () => {
    expect([...MACHINE_FOLDERS, ...Object.values(DEFAULT_ROLE_PATHS)]).not.toContain('layouts')
  })

  /**
   * What makes the starter folders ORDINARY, and the whole reason they are laid down once rather
   * than ensured: a user who threw `Images/` away meant to, and a folder that came back at the
   * next open would be the old layout wearing a new name.
   *
   * The machine's own are the other way round — rebuildable, so a missing cache folder must not
   * be what stops a project from opening.
   */
  it('puts back the caches on open, and never the folders the user was given', async () => {
    const project = await store.create(root)

    await rm(join(project.path, 'Images'), { recursive: true, force: true })
    await rm(join(project.path, '.index/peaks'), { recursive: true, force: true })
    await store.close()

    await store.open(project.path)

    expect(await exists(join(project.path, 'Images'))).toBe(false)
    expect(await exists(join(project.path, '.index/peaks'))).toBe(true)
  })

  /**
   * Projects made before the rename carry `project.json`, and a studio that only looked for the
   * dotted name would stop opening them. Read either, write the new one — the old file is left
   * where it is rather than deleted: a folder the user may be syncing is not ours to tidy.
   */
  it('opens a project whose manifest still carries the old name', async () => {
    const path = join(root, 'Older project')
    await mkdir(join(path, '.index'), { recursive: true })
    await writeFile(
      join(path, 'project.json'),
      JSON.stringify({
        version: 1,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
      'utf8',
    )

    const project = await store.open(path)

    expect(projectName(project.path)).toBe(basename(path))

    // Migrated as it is read, so the parc converges on its own rather than on the next release.
    // The content is checked, not just the presence: a migration writing the wrong bytes would
    // otherwise ship unseen.
    expect(JSON.parse(await readFile(join(path, MANIFEST_FILE), 'utf8'))).toEqual(project.manifest)
    expect(await exists(join(path, 'project.json'))).toBe(true)
  })

  /**
   * The migration copies what was understood, never what was merely read. Promoting a truncated
   * legacy manifest would make the dotted copy win on every later open, and the healthy file
   * beside it would never be read again — a project broken for good, on disk, by opening it.
   */
  it('does not promote a legacy manifest it could not parse', async () => {
    const path = join(root, 'Truncated legacy')
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'project.json'), '{ "version": 1, "name"', 'utf8')

    await expect(store.open(path)).rejects.toMatchObject({ reason: 'unreadable' })

    expect(await exists(join(path, MANIFEST_FILE))).toBe(false)
  })
})

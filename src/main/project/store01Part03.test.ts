import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MANIFEST_FILE, MANIFEST_VERSION } from '@shared/domain/project'

import { createProjectStore, ProjectOpenError, type ProjectStore } from './store'

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

  // Valid JSON the schema still refuses. The bytes are readable, which is exactly what makes this
  // the case a parse-only guard would wave through.
  it('does not promote a legacy manifest the schema refuses', async () => {
    const path = join(root, 'Nameless legacy')
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'project.json'), JSON.stringify({ version: 1 }), 'utf8')

    await expect(store.open(path)).rejects.toMatchObject({ reason: 'unreadable' })

    expect(await exists(join(path, MANIFEST_FILE))).toBe(false)
  })

  // A manifest from a newer studio is not broken, but this build did not understand it either.
  // Leaving it under its old name costs nothing: the build that can read it will migrate it.
  it('does not promote a legacy manifest written by a newer studio', async () => {
    const path = join(root, 'Newer legacy')
    await mkdir(path, { recursive: true })
    await writeFile(
      join(path, 'project.json'),
      JSON.stringify({
        version: MANIFEST_VERSION + 1,
        name: 'Newer legacy',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
      'utf8',
    )

    await expect(store.open(path)).rejects.toMatchObject({ reason: 'too-new' })

    expect(await exists(join(path, MANIFEST_FILE))).toBe(false)
  })

  /**
   * A manifest that exists but cannot be read is NOT a project made before the rename. Taking it
   * for one would read the stale copy beside it and write that over the real thing — the user's
   * own manifest, destroyed without a word. Only an absent file may fall back.
   */
  it('refuses to overwrite a manifest it merely failed to read', async () => {
    const created = await store.create(root)
    const hidden = join(created.path, MANIFEST_FILE)
    const before = await readFile(hidden, 'utf8')

    await writeFile(
      join(created.path, 'project.json'),
      JSON.stringify({ ...created.manifest, name: 'Stale name' }),
      'utf8',
    )
    // Writable but unreadable, which is what a restore tool or a syncing service can leave.
    await chmod(hidden, 0o200)
    await store.close()

    await expect(store.open(created.path)).rejects.toThrow()

    await chmod(hidden, 0o600)
    expect(await readFile(hidden, 'utf8')).toBe(before)
  })

  // The reason has to travel with the rejection, or what reaches the user is an `ENOENT` about
  // a path they never typed — they picked a folder from a dialog.
  describe('a folder that will not open', () => {
    const reasonOf = async (path: string): Promise<string> => {
      try {
        await store.open(path)
      } catch (error) {
        if (error instanceof ProjectOpenError) return error.reason
        throw error
      }
      throw new Error('the folder opened')
    }

    it('tells a folder that is not a project from one that is broken', async () => {
      const plain = join(root, 'Just a folder')
      await mkdir(plain, { recursive: true })

      expect(await reasonOf(plain)).toBe('not-a-project')
    })

    it('calls a manifest that is not JSON unreadable', async () => {
      const path = join(root, 'Truncated')
      await mkdir(path, { recursive: true })
      await writeFile(join(path, MANIFEST_FILE), '{ "version": 1, "name"', 'utf8')

      expect(await reasonOf(path)).toBe('unreadable')
    })

    // `1.5` is a broken manifest, not a newer one: telling its owner to update the studio would
    // send them after a release that will never fix it.
    it('calls a version that is not a whole number unreadable', async () => {
      const path = join(root, 'Fractional')
      await mkdir(path, { recursive: true })
      await writeFile(
        join(path, MANIFEST_FILE),
        JSON.stringify({
          version: 1.5,
          name: 'Fractional',
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-01T10:00:00.000Z',
        }),
        'utf8',
      )

      expect(await reasonOf(path)).toBe('unreadable')
    })

    it('calls a manifest missing a field unreadable', async () => {
      const path = join(root, 'Fieldless')
      await mkdir(path, { recursive: true })
      await writeFile(join(path, MANIFEST_FILE), JSON.stringify({ version: 1 }), 'utf8')

      expect(await reasonOf(path)).toBe('unreadable')
    })

    /**
     * The one that loses work rather than merely annoying: opened, it would be written back with
     * this build's model and silently flattened. `documentEnvelope` has capped its version since
     * the beginning; the manifest only floored it, and a project is the whole folder.
     */
    it('refuses a project written by a later build rather than flattening it', async () => {
      const path = join(root, 'From the future')
      await mkdir(path, { recursive: true })
      await writeFile(
        join(path, MANIFEST_FILE),
        JSON.stringify({
          version: MANIFEST_VERSION + 1,
          name: 'From the future',
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
        }),
        'utf8',
      )

      expect(await reasonOf(path)).toBe('too-new')
      // The manifest itself is untouched: a refusal must not rewrite what a later build owns.
      expect(JSON.parse(await readFile(join(path, MANIFEST_FILE), 'utf8'))).toMatchObject({
        version: MANIFEST_VERSION + 1,
      })
    })
  })
})

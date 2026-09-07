import { mkdtemp, rm } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProjectStore, NoProjectError, type ProjectStore } from './store'

import { memoryCatalog } from './catalog-fixtures'

type ExecDone = (error: Error | null, stdout: string, stderr: string) => void

/** Hoisted: `hideFromExplorer.ts` promisifies `execFile` as it loads, before a `beforeEach` runs. */
const execFileMock = vi.hoisted(() =>
  vi.fn((_command: string, _args: string[], done: ExecDone) => {
    done(null, '', '')
  }),
)

vi.mock('node:child_process', () => ({ execFile: execFileMock }))

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

  it('keeps the open project when the next one fails to open', async () => {
    let failNext = false
    const fragile = createProjectStore({
      openCatalog: async () => {
        if (failNext) throw new Error('database is locked')
        return memoryCatalog()
      },
      now: () => '2026-08-06T10:00:00.000Z',
      onChange,
      onRoles: () => {},
    })

    const first = await fragile.create(join(root, 'first'))
    const second = await fragile.create(join(root, 'second'))
    await fragile.open(first.path)

    failNext = true

    // The catalogue that failed must not cost the user the one that was working.
    await expect(fragile.open(second.path)).rejects.toThrow('database is locked')
    expect(fragile.current()).toEqual(first)
    expect(() => fragile.catalog()).not.toThrow()

    await fragile.close()
  })

  it('refuses to hand out a catalogue or a path with no project open', () => {
    expect(() => store.catalog()).toThrow(NoProjectError)
    expect(() => store.path()).toThrow(NoProjectError)
  })

  it('indexes into the project that is open, and only that one', async () => {
    await store.create(root)
    await store.catalog().add({
      id: 'asset_1',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-08-06T10:00:00.000Z',
    })

    await store.create(root)
    await expect(store.catalog().search({})).resolves.toEqual([])
  })
})

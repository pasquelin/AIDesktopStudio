import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { basename, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LEGACY_MANIFEST_FILE,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  projectName,
} from '@shared/domain/project'

import { isRecord } from '@shared/guards'

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

  // `updatedAt` used to be written once, at creation, and to equal `createdAt` for the life of
  // the project. A field that says "last worked on" and never moves is worse than no field.
  describe('stamping the manifest', () => {
    const stampedIn = async (project: { path: string }): Promise<string> => {
      const manifest: unknown = JSON.parse(
        await readFile(join(project.path, MANIFEST_FILE), 'utf8'),
      )
      return isRecord(manifest) && typeof manifest.updatedAt === 'string' ? manifest.updatedAt : ''
    }

    it('writes the moment of the last save, and leaves the creation alone', async () => {
      const project = await store.create(root)
      clock = '2026-08-06T11:30:00.000Z'

      store.touch()
      await store.settled()

      expect(await stampedIn(project)).toBe('2026-08-06T11:30:00.000Z')
      expect(store.current()?.manifest.createdAt).toBe('2026-08-06T10:00:00.000Z')
      expect(store.current()?.manifest.updatedAt).toBe('2026-08-06T11:30:00.000Z')
    })

    // Autosave fires far faster than the clock moves: a write per save of the same millisecond
    // would spend the disk on a field nobody would see change.
    it('writes nothing when the stamp would not change', async () => {
      const project = await store.create(root)
      const before = await stat(join(project.path, MANIFEST_FILE))

      store.touch()
      await store.settled()

      expect((await stat(join(project.path, MANIFEST_FILE))).mtimeMs).toBe(before.mtimeMs)
    })

    it('does nothing at all when no project is open', async () => {
      expect(() => store.touch()).not.toThrow()
      await store.settled()
    })
  })

  /**
   * The Windows half, which no run on this machine would otherwise reach: a leading dot means
   * nothing to the Explorer, so the attribute has to be set through `attrib`. Both the folder
   * and the manifest are hidden, and a failure must not cost the user the project.
   */
  describe('on Windows', () => {
    const realPlatform = process.platform
    const asWindows = (): void => {
      Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    }

    afterEach(() => {
      Object.defineProperty(process, 'platform', { configurable: true, value: realPlatform })
      vi.unstubAllGlobals()
    })

    it('hides what the machine keeps, through the attribute the Explorer reads', async () => {
      asWindows()
      await store.create(root)

      const hidden = execFileMock.mock.calls.flatMap(([, args]) => args.slice(1))
      expect(hidden.some(path => path.endsWith('.index'))).toBe(true)
      expect(hidden.some(path => path.endsWith(MANIFEST_FILE))).toBe(true)
    })

    // The promoted copy is a file the studio just created, so it needs the attribute as much as
    // one written by `create` — without it the Explorer shows the dotted manifest beside the old
    // one, and the folder looks like it grew a stray file by being opened.
    it('hides the manifest it migrates from the old name', async () => {
      asWindows()
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

      await store.open(path)

      const hidden = execFileMock.mock.calls.flatMap(([, args]) => args.slice(1))
      expect(hidden.filter(entry => entry.endsWith(MANIFEST_FILE))).toEqual([
        join(path, MANIFEST_FILE),
      ])
    })

    it('opens the project even when the attribute cannot be set', async () => {
      asWindows()
      execFileMock.mockImplementation((_command, _args, done) => {
        done(new Error('attrib is not on the PATH'), '', '')
      })

      await expect(store.create(root)).resolves.toBeTruthy()
    })
  })

  it('announces the project it just opened', async () => {
    const project = await store.create(root)
    expect(onChange).toHaveBeenCalledWith(project)
    expect(store.current()).toEqual(project)
  })

  it('announces that no project is open once it is closed', async () => {
    await store.create(root)
    await store.close()

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(store.current()).toBeNull()
  })

  /**
   * The same order `activate` keeps before a swap: what is still queued belongs to the project
   * being left, and its catalogue is about to stop answering.
   */
  it('settles what belongs to the project before its catalogue goes', async () => {
    let settled = false
    const settling = createProjectStore({
      openCatalog: async () => memoryCatalog(),
      now: () => clock,
      onChange,
      onRoles: () => {},
      // Read INSIDE the settling: the project still being there is the order this exists for.
      settle: async () => {
        settled = settling.current() !== null
      },
    })

    await settling.create(join(root, 'settling'))
    await settling.close()

    expect(settled).toBe(true)
  })

  it('keeps the project open until a registered file and catalogue write settles', async () => {
    await store.create(root)
    let release = (): void => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const writing = store.duringWrite(async (projectRoot, catalog) => {
      expect(projectRoot).toBe(root)
      expect(catalog).toBe(store.catalog())
      await held
    })

    const closing = store.close()
    await Promise.resolve()
    expect(store.current()).not.toBeNull()
    release()
    await Promise.all([writing, closing])

    expect(store.current()).toBeNull()
  })

  /**
   * `touch` replaces the project with a new object carrying a fresh stamp on every document
   * saved, and `autosaveOpenDocuments` fires on a timer from any window. Read by identity, the
   * guard below then took an autosave for another project and left the catalogue open while the
   * window that asked had already gone back to the home.
   */
  it('closes all the same when a save stamped the manifest while it settled', async () => {
    let stamping: (() => void) | null = null
    const stamped = createProjectStore({
      openCatalog: async () => memoryCatalog(),
      now: () => clock,
      onChange,
      onRoles: () => {},
      settle: async () => {
        stamping?.()
      },
    })

    await stamped.create(join(root, 'stamped'))
    clock = '2026-08-06T11:00:00.000Z'
    stamping = stamped.touch

    await stamped.close()

    expect(stamped.current()).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('announces nothing when there was no project to close', async () => {
    vi.mocked(onChange).mockClear()

    await store.close()

    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * `projectOpen` and `projectClose` are independent handlers: a closing that settles slowly —
   * a journal flush on a network volume — must not tear down whatever opened meanwhile.
   */
  it('leaves alone a project opened while it was settling', async () => {
    // Held for the closing alone: `activate` settles too, so a hold that outlived the first
    // await would block the very opening this case has to let through.
    let hold: Promise<void> | null = null
    const racing = createProjectStore({
      openCatalog: async () => memoryCatalog(),
      now: () => clock,
      onChange,
      onRoles: () => {},
      settle: async () => {
        if (hold) await hold
      },
    })

    const first = await racing.create(join(root, 'first'))
    const second = await racing.create(join(root, 'second'))
    await racing.open(first.path)

    let release = (): void => {}
    hold = new Promise<void>(resolve => {
      release = resolve
    })

    const closing = racing.close()
    hold = null
    await racing.open(second.path)
    release()
    await closing

    expect(racing.current()).toEqual(second)
    expect(onChange).toHaveBeenLastCalledWith(second)

    await racing.close()
  })

  describe('inspecting a folder before creating in it', () => {
    it('calls an empty folder blank, and one with files of its own occupied', async () => {
      expect(await store.inspect(root)).toBe('blank')

      await writeFile(join(root, 'rush.mp4'), 'x', 'utf8')
      expect(await store.inspect(root)).toBe('occupied')
    })

    // Every folder made on a Mac gets one, and asking the user about it would put a dialog in
    // front of a folder they would rightly call empty.
    it('does not count a hidden entry as content', async () => {
      await writeFile(join(root, '.DS_Store'), 'x', 'utf8')
      expect(await store.inspect(root)).toBe('blank')
    })

    it('recognises a folder that is already a project', async () => {
      const created = await store.create(root)
      expect(await store.inspect(created.path)).toBe('project')
    })

    // The catalogue would have two owners for the same files, and the outer project indexes the
    // inner one's assets as its own.
    it('refuses a folder sitting anywhere under a project', async () => {
      await store.create(root)

      await expect(store.inspect(join(root, 'documents'))).rejects.toMatchObject({
        reason: 'nested',
      })
      await expect(store.inspect(join(root, 'assets', 'img', 'deep'))).rejects.toMatchObject({
        reason: 'nested',
      })
    })

    /**
     * The other direction, and the one the picker makes easy: it opens on the folder the last
     * project was made in, so choosing without descending would wrap every project already
     * there — and every later creation under it would then be refused as nested, curable only
     * by deleting a hidden file by hand.
     */
    it('refuses a folder that already holds projects', async () => {
      await store.create(join(root, 'Reel'))
      await store.close()

      await expect(store.inspect(root)).rejects.toMatchObject({ reason: 'holds-projects' })
    })

    // `project.json` is one of the commonest filenames there is, and taking a stray one for a
    // project would refuse every folder under a checkout that holds one, with no way past it.
    it('does not take a stray project.json above the folder for a project', async () => {
      await writeFile(join(root, LEGACY_MANIFEST_FILE), JSON.stringify({ name: 'some tool' }))
      const below = join(root, 'Reel')
      await mkdir(below)

      expect(await store.inspect(below)).toBe('blank')
    })

    // The reason this exists at all: `create` writes a manifest unconditionally, so a caller
    // that took "cannot read it" for "there is none" would replace an identity the user still
    // has documents under.
    it('raises rather than answering, for a manifest that exists but will not parse', async () => {
      await writeFile(join(root, MANIFEST_FILE), 'not json at all', 'utf8')

      await expect(store.inspect(root)).rejects.toThrow(ProjectOpenError)
    })

    it('raises for a project made by a newer build', async () => {
      await writeFile(
        join(root, MANIFEST_FILE),
        JSON.stringify({
          version: MANIFEST_VERSION + 1,
          name: 'Future',
          createdAt: '',
          updatedAt: '',
        }),
        'utf8',
      )

      await expect(store.inspect(root)).rejects.toMatchObject({ reason: 'too-new' })
    })
  })

  it('reopens a project it created', async () => {
    const created = await store.create(root)
    await store.close()

    expect(store.current()).toBeNull()
    expect(await store.open(created.path)).toEqual(created)
  })

  it('refuses a manifest it cannot make sense of', async () => {
    const created = await store.create(root)
    await writeFile(join(created.path, '.project.json'), '{"name":42}', 'utf8')
    await store.close()

    await expect(store.open(created.path)).rejects.toThrow()
  })

  // A folder carrying both is a project opened once since the rename: the old file is left where
  // it is, so it must not be the one that wins.
  it('prefers the hidden manifest over the one left beside it', async () => {
    const created = await store.create(root)
    await writeFile(
      join(created.path, 'project.json'),
      JSON.stringify({ ...created.manifest, name: 'Stale name' }),
      'utf8',
    )
    await store.close()

    expect(projectName((await store.open(created.path)).path)).toBe(basename(created.path))
  })
})

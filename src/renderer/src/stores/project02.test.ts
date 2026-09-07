import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectName, type RecentProject } from '@shared/domain/project'
import type * as DocumentIo from '@/features/shell/documentIo'
import { installFakeBridge } from '@/services/fakeBridge'
import type { FileOutcome } from '@shared/domain/fileOp'
import { useProject } from './project'
import { useSettings } from './settings'
import { ASSISTANT_ROLE, type AiRoleId, type RoleProvider } from '@shared/domain/aiRole'

const closeOrphanTabs = vi.hoisted(() => vi.fn())
vi.mock('@/features/shell/orphanTabs', () => ({ closeOrphanTabs }))

// Only the question: `refreshDocuments` on the same module is what every case below leans on,
// and a whole fake of it would leave `followProject` asserting nothing.
const settleUnsavedWorkForProjectChange = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/features/shell/documentIo', async importOriginal => ({
  ...(await importOriginal<typeof DocumentIo>()),
  settleUnsavedWorkForProjectChange,
}))

const MANIFEST = { version: 1, name: 'demo', createdAt: '', updatedAt: '' }

const nothingMoved = (): Promise<FileOutcome> =>
  Promise.resolve({ done: [], refused: [], batch: 'batch-1' })

beforeEach(() => {
  useProject.setState({ project: null, known: false })
  closeOrphanTabs.mockClear()
  settleUnsavedWorkForProjectChange.mockClear()
  settleUnsavedWorkForProjectChange.mockResolvedValue(true)
  installFakeBridge()
})

/**
 * `known` is what the home waits on before drawing anything: the initial `null` is "not asked
 * yet", not "no project". Every way out of `connect` has to settle it, or the studio opens on a
 * blank page nothing will ever fill.
 */
describe('closing the open project', () => {
  const OPEN: RecentProject = {
    path: '/projects/Summer',
    openedAt: '2026-08-10T09:00:00.000Z',
  }

  beforeEach(() => {
    useProject.setState({ project: { path: OPEN.path, manifest: MANIFEST }, known: true })
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          recentProjects: [OPEN],
          lastProject: OPEN.path,
        },
      },
    }))
  })

  /**
   * The two questions in order. Reversed, someone answering for three documents would then be
   * asked whether to close at all — and their three answers would have been for nothing.
   */
  it('asks about the generations before asking about the documents', async () => {
    const askLeave = vi.fn(() => Promise.resolve(false))
    const close = vi.fn(() => Promise.resolve())
    installFakeBridge({ project: { askLeave, close } })

    await expect(useProject.getState().close()).resolves.toBe('kept')

    expect(askLeave).toHaveBeenCalled()
    expect(settleUnsavedWorkForProjectChange).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(useProject.getState().project).not.toBeNull()
  })

  /**
   * `refreshDocuments` drops every open document without unloading anything, so no
   * `beforeunload` ever sees a project leave — `guardUnsavedWork` writes that trou in clear.
   * The question therefore belongs to the gesture, and a no has to leave everything standing.
   */
  it('leaves the project open when the question about unsaved work is cancelled', async () => {
    const close = vi.fn(() => Promise.resolve())
    installFakeBridge({ project: { close } })
    settleUnsavedWorkForProjectChange.mockResolvedValue(false)

    await expect(useProject.getState().close()).resolves.toBe('kept')

    expect(close).not.toHaveBeenCalled()
    expect(useProject.getState().project).not.toBeNull()
  })

  it('asks the main process and leaves the studio with no project', async () => {
    const close = vi.fn(() => Promise.resolve())
    installFakeBridge({ project: { close } })

    await useProject.getState().close()

    expect(close).toHaveBeenCalled()
    expect(useProject.getState().project).toBeNull()
  })

  /**
   * `startup: 'lastProject'` is the default, so a closing that left the pointer behind would be
   * undone by the next launch: the project reopens, and nothing says why. The shelf is NOT
   * touched with it — the row is what the project is reopened from, and that is the whole
   * difference with forgetting one.
   */
  it('clears the startup pointer and leaves the shelf alone', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({ settings: { write } })

    await useProject.getState().close()

    expect(write).toHaveBeenCalledWith({ storage: { lastProject: undefined } })
  })

  /**
   * A second window reaches here on the same gesture, after the first one has already closed.
   * Writing the settings then would clear a pointer another project has since claimed.
   */
  it('writes nothing when no project is open', async () => {
    const close = vi.fn(() => Promise.resolve())
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    useProject.setState({ project: null, known: true })
    installFakeBridge({ project: { close }, settings: { write } })

    await useProject.getState().close()

    expect(close).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})

/**
 * The shelf is a list of shortcuts, and dropping one is not a gesture on anyone's disk: the
 * folder stays, and reopening the project puts the row back. That is what makes the home's menu
 * safe to offer with no confirmation behind it.
 */
describe('dropping a project from the shelf', () => {
  const SUMMER: RecentProject = {
    path: '/projects/Summer',
    openedAt: '2026-08-10T09:00:00.000Z',
  }
  const WINTER: RecentProject = {
    path: '/projects/Winter',
    openedAt: '2026-08-09T09:00:00.000Z',
  }

  beforeEach(() => {
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          recentProjects: [SUMMER, WINTER],
          lastProject: undefined,
        },
      },
    }))
  })

  it('writes the shelf back without the folder it was handed', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({ settings: { write } })

    await useProject.getState().forget(SUMMER.path)

    expect(write).toHaveBeenCalledWith({
      storage: { recentProjects: [WINTER], recentDocuments: [] },
    })
  })

  /**
   * `startup: 'lastProject'` is the default, so a removal that left the pointer behind was undone
   * by the next launch: the project reopened, `withRecentProject` put it back at the top, and
   * nothing anywhere said why the row had returned.
   */
  it('clears the startup pointer when it named the folder being dropped', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, lastProject: SUMMER.path },
      },
    }))
    installFakeBridge({ settings: { write } })

    await useProject.getState().forget(SUMMER.path)

    expect(write).toHaveBeenCalledWith({
      storage: { recentProjects: [WINTER], recentDocuments: [], lastProject: undefined },
    })
  })

  // …and leaves it alone otherwise: dropping one project must not stop another from reopening.
  it('leaves the startup pointer alone when it names another project', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, lastProject: WINTER.path },
      },
    }))
    installFakeBridge({ settings: { write } })

    await useProject.getState().forget(SUMMER.path)

    expect(write).toHaveBeenCalledWith({
      storage: { recentProjects: [WINTER], recentDocuments: [] },
    })
  })

  // The row says "removes it from this list only". Nothing may reach the folder itself.
  it('touches nothing on the disk', async () => {
    const trashFiles = vi.fn(nothingMoved)
    installFakeBridge({ project: { trashFiles } })

    await useProject.getState().forget(SUMMER.path)

    expect(trashFiles).not.toHaveBeenCalled()
  })

  it('says nothing and does nothing with no bridge to write through', async () => {
    vi.unstubAllGlobals()

    await expect(useProject.getState().forget(SUMMER.path)).resolves.toBeUndefined()
  })

  // The same forgetting, reached from the other side: an opening can fail anywhere, and a list
  // that only forgets when the home asked it keeps offering a folder nothing can open.
  it('forgets a folder that will not open, wherever the click came from', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({ settings: { write } })

    await expect(useProject.getState().open(SUMMER.path)).resolves.toBe(false)

    expect(write).toHaveBeenCalledWith({
      storage: { recentProjects: [WINTER], recentDocuments: [] },
    })
  })
})

/**
 * Renaming a project, which is TWO writes that belong together: the manifest, which only the main
 * process can touch, and the `recentProjects` entry, which stores the name rather than deriving it
 * from the folder. Skipping the second lists the project under its old name until it is reopened.
 */
describe('giving a project a new name', () => {
  const SUMMER: RecentProject = {
    path: '/projects/Summer',
    openedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-05-01T09:00:00.000Z',
  }

  const RENAMED = { path: '/projects/Winter', manifest: { ...MANIFEST, name: 'Winter' } }

  beforeEach(() => {
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...state.settings.storage, recentProjects: [SUMMER] },
      },
    }))
  })

  it('moves the folder, then the shelf entry that points at it', async () => {
    const rename = vi.fn(() => Promise.resolve(RENAMED))
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({ project: { rename }, settings: { write } })

    await expect(useProject.getState().rename(SUMMER.path, 'Winter')).resolves.toMatchObject({
      ok: true,
    })

    expect(rename).toHaveBeenCalledWith(SUMMER.path, 'Winter')
    // 🛑 The PATH moves with the name: an entry left where it was points at a folder that is no
    // longer there, and `projects.list` then answers a path nothing opens.
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: expect.objectContaining({ recentProjects: [{ ...SUMMER, path: RENAMED.path }] }),
      }),
    )
  })

  /** One role override, as `ai.projectRoles` shapes it — the value is not what this case is about. */
  const ROLE_HELD: Partial<Record<AiRoleId, RoleProvider>> = {
    [ASSISTANT_ROLE]: { kind: 'cloud', providerId: 'deepseek' },
  }

  /**
   * 🛑 EVERYTHING keyed by folder moves with it, and the account link above all: orphaned at the
   * old path, `planProjectAccount` answers `adopt` and the project silently comes back on whichever
   * key is active — a destructive write nobody asked for.
   */
  it('moves every table keyed on the folder, not only the shelf', async () => {
    installFakeBridge({ project: { rename: () => Promise.resolve(RENAMED) } })
    const write = vi.fn(async () => {})
    useSettings.setState(state => ({
      write,
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          recentProjects: [SUMMER],
          lastProject: SUMMER.path,
          projectAccounts: { [SUMMER.path]: 'account-1' },
        },
        ai: { ...state.settings.ai, projectRoles: { [SUMMER.path]: ROLE_HELD } },
      },
    }))

    await useProject.getState().rename(SUMMER.path, 'Winter')

    expect(write).toHaveBeenCalledWith({
      storage: {
        recentProjects: [{ ...SUMMER, path: RENAMED.path }],
        projectAccounts: { [RENAMED.path]: 'account-1' },
        lastProject: RENAMED.path,
      },
      ai: { projectRoles: { [RENAMED.path]: ROLE_HELD } },
    })
  })

  // The title bar reads the folder. Waiting for the broadcast to come back would leave it
  // naming the old one for a frame.
  it('takes the new name straight away when the renamed project is the open one', async () => {
    installFakeBridge({ project: { rename: () => Promise.resolve(RENAMED) } })
    useProject.setState({ project: { path: SUMMER.path, manifest: MANIFEST }, known: true })

    await useProject.getState().rename(SUMMER.path, 'Winter')

    expect(projectName(useProject.getState().project?.path ?? '')).toBe('Winter')
  })

  // The shelf lists projects that are not open, and renaming one must not put it in front.
  it('leaves the open project alone when another one is renamed', async () => {
    const open = { path: '/projects/other', manifest: MANIFEST }
    installFakeBridge({ project: { rename: () => Promise.resolve(RENAMED) } })
    useProject.setState({ project: open, known: true })

    await useProject.getState().rename(SUMMER.path, 'Winter')

    expect(useProject.getState().project).toBe(open)
  })

  /**
   * The manifest is written FIRST for this reason: a folder gone since the shelf last saw it is the
   * ordinary case there, and the settings must not end up claiming a name the disk refused.
   */
  it('leaves the shelf alone when the disk refused the name', async () => {
    const write = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({
      project: { rename: () => Promise.reject(new Error('not a project')) },
      settings: { write },
    })

    await expect(useProject.getState().rename(SUMMER.path, 'Winter')).resolves.toMatchObject({
      ok: false,
      why: expect.stringContaining('not a project'),
    })

    expect(write).not.toHaveBeenCalled()
  })

  // The FOLDER moves in the main process, which owns it. No file gesture of this store's may
  // reach the disk on the way — a rename is not a file operation the undo stack should hold.
  it('moves nothing through the file channels', async () => {
    const renameFile = vi.fn(nothingMoved)
    const trashFiles = vi.fn(nothingMoved)
    installFakeBridge({
      project: { rename: () => Promise.resolve(RENAMED), renameFile, trashFiles },
    })

    await useProject.getState().rename(SUMMER.path, 'Winter')

    expect(renameFile).not.toHaveBeenCalled()
    expect(trashFiles).not.toHaveBeenCalled()
  })

  it('says nothing and does nothing with no bridge to write through', async () => {
    vi.unstubAllGlobals()

    await expect(useProject.getState().rename(SUMMER.path, 'Winter')).resolves.toEqual({
      ok: false,
      why: null,
    })
  })
})

/**
 * 🛑 The gesture `forget` above is NOT. This one bins the folder, and everything keyed on the path
 * it held goes with it: nothing brings a project back once the folder has left.
 */

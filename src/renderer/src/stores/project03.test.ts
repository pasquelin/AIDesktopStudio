import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type RecentProject } from '@shared/domain/project'
import type * as DocumentIo from '@/features/shell/documentIo'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useProject } from './project'
import type { ProjectBinned } from '@shared/ipc'
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
describe('putting a project folder in the trash', () => {
  const SUMMER: RecentProject = {
    path: '/projects/Summer',
    openedAt: '2026-08-10T09:00:00.000Z',
  }
  const WINTER: RecentProject = {
    path: '/projects/Winter',
    openedAt: '2026-08-09T09:00:00.000Z',
  }
  const ROLE_HELD: Partial<Record<AiRoleId, RoleProvider>> = {
    [ASSISTANT_ROLE]: { kind: 'cloud', providerId: 'deepseek' },
  }

  /** The shelf, the pointer, the account link and the roles — all four keyed on the folder. */
  const binning = (project: BridgeOverrides['project'], lastProject = SUMMER.path) => {
    const write = vi.fn(async () => {})
    installFakeBridge({ project })
    useSettings.setState(state => ({
      write,
      settings: {
        ...state.settings,
        storage: {
          ...state.settings.storage,
          recentProjects: [SUMMER, WINTER],
          lastProject,
          projectAccounts: { [SUMMER.path]: 'account-1', [WINTER.path]: 'account-2' },
        },
        ai: { ...state.settings.ai, projectRoles: { [SUMMER.path]: ROLE_HELD } },
      },
    }))
    return write
  }

  it('drops every table keyed on the folder once the bin has happened', async () => {
    const write = binning({ trash: () => Promise.resolve('trashed') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: true,
      trashed: true,
    })

    expect(write).toHaveBeenCalledWith({
      storage: {
        recentProjects: [WINTER],
        recentDocuments: [],
        lastProject: undefined,
        projectAccounts: { [WINTER.path]: 'account-2' },
      },
      ai: { projectRoles: {} },
    })
  })

  /**
   * 🛑 The one this batch nearly shipped: a folder the disk cannot see right now is an UNPLUGGED
   * DRIVE as much as a deletion. Pruning the account link on that is the silent adoption
   * `storage.projectAccounts` was split out to prevent — plug the drive back in, reopen, and the
   * project comes back on whichever key is active. Only the ROW goes, as a failed opening does.
   */
  it('keeps the account link and the roles when no folder was binned', async () => {
    const write = binning({ trash: () => Promise.resolve('missing') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: true,
      trashed: false,
    })

    expect(write).toHaveBeenCalledWith({
      storage: { recentProjects: [WINTER], recentDocuments: [], lastProject: undefined },
    })
  })

  // A folder that is THERE and holds no project: nothing was binned and nothing is written.
  it('writes nothing when the folder holds no project', async () => {
    const write = binning({ trash: () => Promise.resolve('not-a-project') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toMatchObject({
      ok: false,
      declined: false,
    })

    expect(write).not.toHaveBeenCalled()
  })

  /**
   * The open project is LEFT through the same door as every other exit, questions and all — and a
   * no there keeps the folder. Told apart from a failure: the person did not fail, they said no.
   */
  it('bins nothing when the question on the way out is answered no', async () => {
    const trash = vi.fn((): Promise<ProjectBinned> => Promise.resolve('trashed'))
    binning({ trash, askLeave: () => Promise.resolve(false) })
    useProject.setState({ project: { path: SUMMER.path, manifest: MANIFEST }, known: true })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toMatchObject({
      ok: false,
      declined: true,
      why: 'kept',
    })

    expect(trash).not.toHaveBeenCalled()
    expect(useProject.getState().project).not.toBeNull()
  })

  /**
   * 🛑 The project has to be CLOSED before its folder can go — the catalogue holds a file inside
   * it — so a refusal reached a person whose project had been shut for a gesture that never
   * happened, with `lastProject` cleared and nothing anywhere to reopen it.
   */
  it('puts the open project back when nothing was binned', async () => {
    const open = { path: SUMMER.path, manifest: MANIFEST }
    binning({ trash: () => Promise.reject(new Error('EPERM')), open: () => Promise.resolve(open) })
    useProject.setState({ project: open, known: true })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toMatchObject({ ok: false })

    expect(useProject.getState().project?.path).toBe(SUMMER.path)
  })

  /**
   * The folder still stands, so the shelf must go on naming it: forgetting a project the disk
   * still holds is a project nobody can find again.
   */
  it('leaves the shelf alone when the system refused the folder', async () => {
    const write = binning({ trash: () => Promise.reject(new Error('EPERM')) })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: false,
      declined: false,
      why: expect.stringContaining('EPERM'),
    })

    expect(write).not.toHaveBeenCalled()
  })
})

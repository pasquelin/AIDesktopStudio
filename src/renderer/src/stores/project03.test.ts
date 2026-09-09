import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type RecentProject } from '@shared/domain/project'
import type * as DocumentIo from '@/features/shell/documentIo'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useProject } from './project'
import type { ProjectBinned } from '@shared/ipc'
import { useSettings } from './settings'

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
  /**
   * The door, and nothing keyed behind it: what the shelf, the pointer, the account link and the
   * roles become is composed in the main process and covered by `settingsProject.test.ts`. What
   * is asserted here is which folder is named, and whether it is named as really binned.
   */
  const binning = (project: BridgeOverrides['project']) => {
    const forgetProject = vi.fn(() => Promise.resolve(useSettings.getState().settings))
    installFakeBridge({ project, settings: { forgetProject } })
    return forgetProject
  }

  /**
   * 🛑 A real bin, said as such to the main process — which is what drops the account link and the
   * roles with the row. Composed here, the whole shelf travelled from this window's replica and
   * took every write the main process had made since the last broadcast with it.
   */
  it('tells the main process the folder really went, so what is keyed on it goes too', async () => {
    const forgetProject = binning({ trash: () => Promise.resolve('trashed') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: true,
      trashed: true,
    })

    expect(forgetProject).toHaveBeenCalledWith(SUMMER.path, true)
  })

  /**
   * 🛑 The one this batch nearly shipped: a folder the disk cannot see right now is an UNPLUGGED
   * DRIVE as much as a deletion. Pruning the account link on that is the silent adoption
   * `storage.projectAccounts` was split out to prevent — plug the drive back in, reopen, and the
   * project comes back on whichever key is active. Only the ROW goes, as a failed opening does.
   */
  it('keeps the account link and the roles when no folder was binned', async () => {
    const forgetProject = binning({ trash: () => Promise.resolve('missing') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: true,
      trashed: false,
    })

    expect(forgetProject).toHaveBeenCalledWith(SUMMER.path, false)
  })

  // A folder that is THERE and holds no project: nothing was binned and nothing is written.
  it('writes nothing when the folder holds no project', async () => {
    const forgetProject = binning({ trash: () => Promise.resolve('not-a-project') })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toMatchObject({
      ok: false,
      declined: false,
    })

    expect(forgetProject).not.toHaveBeenCalled()
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
    const forgetProject = binning({ trash: () => Promise.reject(new Error('EPERM')) })

    await expect(useProject.getState().trash(SUMMER.path)).resolves.toEqual({
      ok: false,
      declined: false,
      why: expect.stringContaining('EPERM'),
    })

    expect(forgetProject).not.toHaveBeenCalled()
  })
})

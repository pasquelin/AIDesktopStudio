import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { type Project } from '@shared/domain/project'
import type * as DocumentIo from '@/features/shell/documentIo'
import { installFakeBridge } from '@/services/fakeBridge'
import type { ActivityEntry } from '@shared/domain/activity'
import { useActivity } from './activity'
import { assetsById, useAssets } from './assets'
import { useProject } from './project'
import { selectedFilePaths, useSelection } from './selection'
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

/** A toast standing on screen — what following another project is right to sweep away, and a
 *  rename is not. */
const TOAST: ActivityEntry = {
  id: 1,
  at: '2026-08-13T10:00:00.000Z',
  level: 'error',
  topic: 'project',
  messageKey: 'activity.projectNotRenamed',
}

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
describe('saying that the answer has arrived', () => {
  it('settles on what the main process holds', async () => {
    await useProject.getState().connect()

    expect(useProject.getState().known).toBe(true)
    expect(useProject.getState().project).toBeNull()
  })

  it('settles even with no bridge to ask, as a plain browser has none', async () => {
    vi.unstubAllGlobals()

    const stop = await useProject.getState().connect()

    expect(useProject.getState().known).toBe(true)
    expect(stop).toBeTypeOf('function')
  })

  // Left to throw, `connect` also never hands back the unsubscribe, stranding the listener.
  it('settles when the main process refuses to say which project is open', async () => {
    installFakeBridge({ project: { current: () => Promise.reject(new Error('no project')) } })

    const stop = await useProject.getState().connect()

    expect(useProject.getState().known).toBe(true)
    expect(stop).toBeTypeOf('function')
  })
})

/**
 * A tab restored on startup outlives its document: the layout is persisted and the documents
 * are not, so one created and never saved comes back as a tab that says it is not open.
 */
describe('settling the tabs of a project being followed', () => {
  it('closes what the folder and the store both disown', async () => {
    await useProject.getState().connect()

    expect(closeOrphanTabs).toHaveBeenCalled()
  })

  // A folder that went away leaves every document missing, which looks exactly like a project
  // of ghosts — and closing on it would cost a live arrangement for good.
  it('closes nothing when the folder could not be read', async () => {
    installFakeBridge({ documents: { list: () => Promise.reject(new Error('no folder')) } })

    await useProject.getState().connect()

    expect(closeOrphanTabs).not.toHaveBeenCalled()
  })

  /**
   * Announcing the SAME folder is a manifest that changed under it — a rename is the one gesture
   * that does — and following it would empty the scene clipboard, dismiss every toast and refetch
   * three lists in every window, to update a word.
   *
   * The unread toasts are the witness because they are dismissed SYNCHRONOUSLY, before the three
   * requests: `closeOrphanTabs`, the last thing following a project does, sits behind three
   * awaits, so an assertion made on it right after the announcement passes whether the work was
   * skipped or merely not finished — which is what this test did until it was checked by removing
   * the guard and watching it stay green.
   */
  it('follows another project, and stays put when the same folder announces itself', async () => {
    const listeners: ((project: Project | null) => void)[] = []
    const announce = (project: Project): void => listeners.forEach(listener => listener(project))
    installFakeBridge({
      project: {
        onChange: listener => {
          listeners.push(listener)
          return () => {}
        },
      },
    })
    await useProject.getState().connect()

    useActivity.setState({ unread: [TOAST] })
    announce({ path: '/projects/Summer', manifest: MANIFEST })

    expect(useActivity.getState().unread).toEqual([])

    useActivity.setState({ unread: [TOAST] })
    announce({ path: '/projects/Summer', manifest: MANIFEST })

    // 🛑 The same folder again is a manifest that moved under it, never another project: following
    // it would empty the scene clipboard and dismiss every toast to update nothing.
    expect(useActivity.getState().unread).toEqual([TOAST])
    expect(useProject.getState().project?.path).toBe('/projects/Summer')
  })

  /**
   * The by-id index remembers every asset it has been shown, so that narrowing the browser's
   * facet cannot take the names off an open montage. Following another project is the one thing
   * that says a catalogue is over — without this, its rows answer lookups for the next one.
   *
   * Awaited, and that is the case rather than a detail: the forgetting has to happen AFTER the
   * new catalogue has been read. Until then `items` still holds the rows being left, so a
   * forget placed first is undone by any render that reads the index in that window.
   */
  it('leaves the assets of the project it is leaving behind', async () => {
    const listeners: ((project: Project | null) => void)[] = []
    installFakeBridge({
      project: {
        onChange: listener => {
          listeners.push(listener)
          return () => {}
        },
      },
    })
    await useProject.getState().connect()

    useAssets.setState({
      items: [
        {
          id: 'a',
          name: 'One',
          type: 'image',
          location: 'local',
          tags: [],
          createdAt: '2026-08-14',
        },
      ],
    })
    expect(assetsById(useAssets.getState()).get('a')).toBeDefined()

    listeners.forEach(listener => listener({ path: '/projects/Winter', manifest: MANIFEST }))
    // The index read while the new catalogue is still being fetched, which is what a panel
    // rendering in that window does — and what used to put the old rows back for good.
    assetsById(useAssets.getState())

    await vi.waitFor(() => expect(assetsById(useAssets.getState()).get('a')).toBeUndefined())
  })

  /**
   * A folder row is named by its path INSIDE the project, so `Repérages/ruelle.png` names a file
   * in whichever project is open. Left picked across a change, the explorer of the new one
   * highlighted a row nobody chose — and every gesture of that panel acts on the selection.
   */
  it('unpicks what was picked in the project it is leaving', async () => {
    const listeners: ((project: Project | null) => void)[] = []
    installFakeBridge({
      project: {
        onChange: listener => {
          listeners.push(listener)
          return () => {}
        },
      },
    })
    await useProject.getState().connect()
    useSelection.getState().selectFiles(['Repérages/ruelle.png'])

    listeners.forEach(listener => listener({ path: '/projects/Winter', manifest: MANIFEST }))

    expect(selectedFilePaths(useSelection.getState())).toEqual([])
  })
})

/** Switching to a project the shelf already holds — the menu's rows and the home's list. */
describe('opening a folder the studio already knows', () => {
  beforeEach(() => {
    useProject.setState({ project: { path: '/projects/Summer', manifest: MANIFEST }, known: true })
  })

  it('switches to it once the unsaved work has been answered for', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/projects/Winter', manifest: MANIFEST }))
    installFakeBridge({ project: { open } })

    await expect(useProject.getState().open('/projects/Winter')).resolves.toBe(true)

    expect(open).toHaveBeenCalledWith('/projects/Winter')
  })

  // Switching takes the generations out of the bar exactly as closing does, so it owes the same
  // question — and in the same order, before anything is asked about documents.
  it('asks about the generations first, and stays put on a no', async () => {
    const askLeave = vi.fn(() => Promise.resolve(false))
    const open = vi.fn(() => Promise.resolve({ path: '/projects/Winter', manifest: MANIFEST }))
    installFakeBridge({ project: { askLeave, open } })

    await expect(useProject.getState().open('/projects/Winter')).resolves.toBe(false)

    expect(askLeave).toHaveBeenCalled()
    expect(settleUnsavedWorkForProjectChange).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('stays where it is when that question is cancelled', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/projects/Winter', manifest: MANIFEST }))
    installFakeBridge({ project: { open } })
    settleUnsavedWorkForProjectChange.mockResolvedValue(false)

    await expect(useProject.getState().open('/projects/Winter')).resolves.toBe(false)

    expect(open).not.toHaveBeenCalled()
    expect(useProject.getState().project?.path).toBe('/projects/Summer')
  })

  // Choosing the row already ticked means "yes, still" — there is nothing to answer for.
  it('asks nothing at all for the project already in front', async () => {
    await expect(useProject.getState().open('/projects/Summer')).resolves.toBe(true)

    expect(settleUnsavedWorkForProjectChange).not.toHaveBeenCalled()
  })
})

/**
 * Making a project at a named path — what an outside client reaches for, where a person gets the
 * picker. It leaves the open project like everything else here, and used to be the one gesture
 * that did it without asking anything.
 */
describe('making a project at a path', () => {
  const made = { path: '/projects/neuf', manifest: MANIFEST }

  beforeEach(() => {
    useProject.setState({ project: { path: '/projects/Summer', manifest: MANIFEST }, known: true })
  })

  it('asks on the way out, then makes the folder into a project', async () => {
    const create = vi.fn(() => Promise.resolve(made))
    installFakeBridge({ project: { create } })

    await expect(useProject.getState().createAt('/projects/neuf')).resolves.toEqual(made)

    expect(settleUnsavedWorkForProjectChange).toHaveBeenCalled()
    expect(useProject.getState().project?.path).toBe('/projects/neuf')
  })

  it('makes nothing when the question on the way out is answered no', async () => {
    const create = vi.fn(() => Promise.resolve(made))
    installFakeBridge({ project: { create } })
    settleUnsavedWorkForProjectChange.mockResolvedValue(false)

    await expect(useProject.getState().createAt('/projects/neuf')).resolves.toBeNull()

    expect(create).not.toHaveBeenCalled()
    expect(useProject.getState().project?.path).toBe('/projects/Summer')
  })

  // The main process asks about a folder that already holds files, and `null` is that no.
  it('stays where it is when the main process was turned down', async () => {
    installFakeBridge({ project: { create: () => Promise.resolve(null) } })

    await expect(useProject.getState().createAt('/projects/neuf')).resolves.toBeNull()

    expect(useProject.getState().project?.path).toBe('/projects/Summer')
  })
})

/**
 * Every caller does `void openPicked()` — the home's tools, the rail, the native menu and now
 * the explorer's empty state. A refusal left to throw was therefore an unhandled rejection,
 * and the main process has already written the reason in the journal on its way past.
 */
describe('picking a folder in the dialog', () => {
  const picking = (folder: string | null) => ({
    dialog: { pickPath: () => Promise.resolve(folder) },
  })

  it('opens the folder that was picked', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking('/p'), project: { open } })

    await useProject.getState().openPicked()

    expect(open).toHaveBeenCalledWith('/p')
    expect(useProject.getState().project?.path).toBe('/p')
  })

  /**
   * After the folder is chosen and before anything is torn down. The other order put a question
   * about documents in front of someone who had just changed their mind about the picker.
   */
  it('asks about unsaved work only once a folder has been chosen', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking(null), project: { open } })

    await useProject.getState().openPicked()

    expect(settleUnsavedWorkForProjectChange).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  // The third door, and the last one that was silent about it.
  it('opens nothing when the generations question is turned down', async () => {
    const askLeave = vi.fn(() => Promise.resolve(false))
    const open = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking('/p'), project: { askLeave, open } })

    await useProject.getState().openPicked()

    expect(askLeave).toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens nothing when that question is cancelled', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking('/p'), project: { open } })
    settleUnsavedWorkForProjectChange.mockResolvedValue(false)

    await useProject.getState().openPicked()

    expect(open).not.toHaveBeenCalled()
    expect(useProject.getState().project).toBeNull()
  })

  it('survives a folder that will not open', async () => {
    installFakeBridge(picking('/not-a-project'))

    await expect(useProject.getState().openPicked()).resolves.toBeUndefined()
    expect(useProject.getState().project).toBeNull()
  })

  // The folder chosen IS the project: nothing but its path crosses, and the name comes from it
  // on the other side. Sending a name made a subfolder inside the folder the user had picked.
  it('makes the folder that was picked into the project', async () => {
    const create = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking('/p'), project: { create } })

    await useProject.getState().createPicked()

    expect(create).toHaveBeenCalledWith('/p')
    expect(useProject.getState().project?.path).toBe('/p')
  })

  // The main process asks before writing into a folder that holds files, and a "no" comes back
  // as `null`. Read as a project, it would blank the one that is open.
  it('leaves the open project alone when the creation is declined', async () => {
    const create = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ ...picking('/p'), project: { create } })
    useProject.setState({ project: { path: '/open', manifest: MANIFEST }, known: true })

    await useProject.getState().createPicked()

    expect(useProject.getState().project?.path).toBe('/open')
  })

  it('survives a folder that cannot be written', async () => {
    installFakeBridge(picking('/read-only'))

    await expect(useProject.getState().createPicked()).resolves.toBeUndefined()
    expect(useProject.getState().project).toBeNull()
  })

  it('does nothing at all when the dialog is cancelled', async () => {
    const open = vi.fn(() => Promise.resolve({ path: '/p', manifest: MANIFEST }))
    installFakeBridge({ ...picking(null), project: { open } })

    await useProject.getState().openPicked()

    expect(open).not.toHaveBeenCalled()
  })

  /**
   * Where the dialog starts, and it is not cosmetic: the system reopens one wherever it was last
   * left, which after a creation is INSIDE the project just made — so the second project of a
   * session was created within the first, and nothing said so. Which folder that should be is
   * `projectPickerFolder`'s to decide and its own suite's to check; this is the wiring.
   */
  it('starts the dialog where the settings say projects live', async () => {
    const pickPath = vi.fn(() => Promise.resolve(null))
    installFakeBridge({ dialog: { pickPath } })
    const { storage } = useSettings.getState().settings
    // Put back on the way out: this store is module state, and a preference left behind would
    // reach every case below it — including ones written later that never set one.
    onTestFinished(() => {
      useSettings.setState(state => ({ settings: { ...state.settings, storage } }))
    })
    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        storage: { ...storage, projectsFolder: '/Users/someone/Projets' },
      },
    }))

    await useProject.getState().createPicked()

    expect(pickPath).toHaveBeenCalledWith('folder', '/Users/someone/Projets')
  })
})

/**
 * Leaving the project with none in its place — a different gesture from dropping its row, which
 * the section below covers: the shelf keeps the project, and the studio lands back on the home.
 */

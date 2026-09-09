import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileOutcome } from '@shared/domain/fileOp'
import { ContextMenu } from '@/components/ContextMenu'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useProject, type ProjectRenamed, type ProjectTrashed } from '@/stores/project'
import { useTranslation } from 'react-i18next'
import { renderMenuRows } from '@/components/menuRows'
import { projectMenuRows } from './projectMenuRows'

/** What a rename answers back — the row's own path and name are what the cases assert on. */
const RENAMED_OK: ProjectRenamed = {
  ok: true,
  project: {
    path: '/tmp/Renamed',
    manifest: {
      version: 1,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:00:00.000Z',
    },
  },
}

const PATH = '/projects/Summer'

const report = vi.fn(() => Promise.resolve())

const nothingMoved = (): Promise<FileOutcome> =>
  Promise.resolve({ done: [], refused: [], batch: 'batch-1' })

/** Always with the journal wired: a failure this menu drops is the defect being guarded. */
const install = (overrides: BridgeOverrides = {}): void => {
  installFakeBridge({ ...overrides, diagnostics: { report } })
}

/** At the pointer, as the shelf's row raises them. */
const open = (onClose = vi.fn(), onRename?: () => void): void => {
  function Menu() {
    const { t } = useTranslation()
    return (
      <ContextMenu at={{ x: 10, y: 10 }} onClose={onClose}>
        {renderMenuRows(projectMenuRows(t, PATH, onRename), onClose)}
      </ContextMenu>
    )
  }

  render(<Menu />)
}

beforeEach(() => {
  vi.clearAllMocks()
  install()
})

describe('the menu of a recent project', () => {
  it('says what each row does rather than reading its label back', () => {
    open()

    expect(screen.getByRole('menuitem', { name: 'Afficher dans le dossier' })).toHaveAttribute(
      'data-tooltip-content',
      'Ouvre le gestionnaire de fichiers sur ce projet',
    )
    // The one row a reader could take for "delete this project". It has to say that it does not.
    expect(screen.getByRole('menuitem', { name: 'Retirer de la liste' })).toHaveAttribute(
      'data-tooltip-content',
      'Retire le projet de cette liste, sans toucher au dossier ni à ce qu’il contient',
    )
  })

  it('leaves the visible labels to answer for themselves', () => {
    open()

    // An `aria-label` over a visible label replaces it for a screen reader (WCAG 2.5.3).
    for (const row of screen.getAllByRole('menuitem')) {
      expect(row).not.toHaveAttribute('aria-label')
    }
  })

  // The shelf points at projects that are not open, so the folder is named outright — nothing
  // resolves it against the open project.
  it('shows the folder it names, and closes behind itself', async () => {
    const revealFolder = vi.fn(() => Promise.resolve(true))
    const onClose = vi.fn()
    install({ project: { revealFolder } })
    open(onClose)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Afficher dans le dossier' }))

    expect(revealFolder).toHaveBeenCalledWith(PATH)
    expect(onClose).toHaveBeenCalled()
  })

  /**
   * The rename opens a FIELD rather than reaching the disk: the row owns it, as the explorer's
   * does. So the menu's whole job here is to hand the gesture back and get out of the way.
   */
  it('hands the rename back to the row, and closes behind itself', async () => {
    const onRename = vi.fn()
    const onClose = vi.fn()
    open(onClose, onRename)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Renommer' }))

    expect(onRename).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  // Refused rather than silently doing nothing where no field can open — a row that explains
  // nothing and does nothing is the worst of the outcomes this menu can produce.
  it('refuses the rename where no field can open', () => {
    open()

    expect(screen.getByRole('menuitem', { name: 'Renommer' })).toBeDisabled()
  })

  /**
   * The row a reader is most likely to take for "rename the folder on disk". It has to say that it
   * does not: `recentProjects`, `storage.lastProject` and every absolute path the catalogue holds
   * are keyed on that folder.
   */
  it('says the rename leaves the folder alone', () => {
    open(vi.fn(), vi.fn())

    expect(screen.getByRole('menuitem', { name: 'Renommer' })).toHaveAttribute(
      'data-tooltip-content',
      'Changer le nom du projet, sans toucher à son dossier sur le disque',
    )
  })

  it('drops the project from the shelf and closes behind itself', async () => {
    const forget = vi.fn(() => Promise.resolve())
    const onClose = vi.fn()
    useProject.setState({ forget })
    open(onClose)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Retirer de la liste' }))

    expect(forget).toHaveBeenCalledWith(PATH)
    expect(onClose).toHaveBeenCalled()
  })

  /**
   * The menu is gone by the time either answer comes back, so a failure that stays in the
   * promise stays nowhere. Both can genuinely fail — the main process refuses a path that is not
   * absolute, and the settings write can be refused by the disk — and a row that does nothing
   * twice in silence reads as a dead menu.
   */
  describe('when the studio could not do what the row says', () => {
    it('says so when the folder is not there to show', async () => {
      install({ project: { revealFolder: () => Promise.resolve(false) } })
      open()

      await userEvent.click(screen.getByRole('menuitem', { name: 'Afficher dans le dossier' }))

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', scope: 'project.reveal' }),
      )
    })

    it('says so when showing the folder is refused outright', async () => {
      install({
        project: { revealFolder: () => Promise.reject(new Error('not an absolute path')) },
      })
      open()

      await userEvent.click(screen.getByRole('menuitem', { name: 'Afficher dans le dossier' }))

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', scope: 'project.reveal' }),
      )
    })

    it('says so when the shelf could not be written', async () => {
      useProject.setState({ forget: () => Promise.reject(new Error('read-only settings')) })
      open()

      await userEvent.click(screen.getByRole('menuitem', { name: 'Retirer de la liste' }))

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', scope: 'project.forget' }),
      )
    })
  })

  /**
   * What the three other rows promise in words, held in code: pressed one after another they
   * reach nothing on the disk. The fourth is the one that does, and it is answered NO here —
   * `confirmTrash` refuses by default in the fake bridge, exactly as `confirmDelete` does.
   */
  it('reaches the folder from no row but the one that asks first', async () => {
    const trashFiles = vi.fn(nothingMoved)
    const rename = vi.fn(() => Promise.resolve(RENAMED_OK))
    const trash = vi.fn(() => Promise.resolve<ProjectTrashed>({ ok: true, trashed: true }))
    // 🛑 Watched rather than left to the fake's default no: a row that asked NOTHING would pass a
    // sweep that only reads what was binned, and it is the asking that this rule is about.
    const confirmTrash = vi.fn(() => Promise.resolve(false))
    useProject.setState({ forget: () => Promise.resolve(), rename, trash })
    install({ project: { trashFiles, confirmTrash } })
    // Every row enabled, so the sweep below actually presses all four rather than bouncing off
    // a disabled one and reporting that nothing reached the disk.
    open(vi.fn(), vi.fn())

    for (const row of screen.getAllByRole('menuitem')) await userEvent.click(row)

    expect(trashFiles).not.toHaveBeenCalled()
    // The rename reaches the manifest and never the folder: it opens a field here, and even the
    // store's own call renames in place.
    expect(rename).not.toHaveBeenCalled()
    expect(confirmTrash).toHaveBeenCalled()
    expect(trash).not.toHaveBeenCalled()
  })
})

/**
 * The one row of this menu that reaches the disk, and the only one whose promise cannot be
 * undone: nothing in the studio puts a folder back, so the question is the whole safeguard.
 */
describe('sending a project to the trash', () => {
  const binned = (): Promise<ProjectTrashed> => Promise.resolve({ ok: true, trashed: true })

  it('bins the folder once the person has said yes, naming that project alone', async () => {
    const confirmTrash = vi.fn(() => Promise.resolve(true))
    const trash = vi.fn(binned)
    useProject.setState({ trash })
    install({ project: { confirmTrash } })
    open()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    // The FOLDER's own name, never the whole path: it is what the system's dialog reads out.
    expect(confirmTrash).toHaveBeenCalledWith('Summer')
    expect(trash).toHaveBeenCalledWith(PATH)
  })

  // 🛑 A no leaves the folder exactly where it is. Asked and then binned anyway is the one
  // outcome this route exists to make impossible.
  it('leaves the folder alone when the question is answered no', async () => {
    const trash = vi.fn(binned)
    useProject.setState({ trash })
    install({ project: { confirmTrash: () => Promise.resolve(false) } })
    open()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    expect(trash).not.toHaveBeenCalled()
  })

  /**
   * The menu is closed BEFORE the dialog opens — it is the system's, and modal — so the failure
   * has nowhere to land but the journal. `missing` and `not-a-project` are endings rather than
   * throws, and a row that swallowed them did nothing in silence.
   */
  it('says so when the folder could not go', async () => {
    // A folder that holds no project — one of the two endings the store answers `ok: false` for.
    // 🛑 `missing` is NOT one of them: see the case below.
    useProject.setState({
      trash: () => Promise.resolve({ ok: false, declined: false, why: 'not-a-project' }),
    })
    install({ project: { confirmTrash: () => Promise.resolve(true) } })
    open()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', scope: 'project.trash' }),
    )
  })

  /**
   * 🛑 A folder the disk no longer holds is `{ ok: true, trashed: false }`, not a failure — an
   * unplugged drive as much as a deletion. There is nothing to bin and nothing to say: the shelf
   * row goes either way, and a red line about a folder already gone reads as a defect.
   */
  it('stays silent where there was no folder left to bin', async () => {
    useProject.setState({ trash: () => Promise.resolve({ ok: true, trashed: false }) })
    install({ project: { confirmTrash: () => Promise.resolve(true) } })
    open()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    expect(report).not.toHaveBeenCalled()
  })

  // The question travels the boundary like any other call, and the menu is gone by the time it
  // answers — so a channel that refuses outright has the journal or nothing.
  it('says so when the question itself could not be raised', async () => {
    install({ project: { confirmTrash: () => Promise.reject(new Error('no window')) } })
    open()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', scope: 'project.trash' }),
    )
  })

  /**
   * 🛑 The menu closes BEFORE the question opens. The dialog is the system's and it is modal: a
   * menu left standing under it hangs there for as long as nobody answers, and the pointer has
   * nothing to dismiss it with.
   */
  it('closes before the question opens, leaving nothing standing under the dialog', async () => {
    const confirmTrash = vi.fn(() => Promise.resolve(false))
    const onClose = vi.fn()
    install({ project: { confirmTrash } })
    open(onClose)

    await userEvent.click(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))

    expect(onClose).toHaveBeenCalled()
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
      confirmTrash.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('says what it reaches, so it cannot be read as the row above it', () => {
    open()

    expect(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' })).toHaveAttribute(
      'data-tooltip-content',
      'Envoie le dossier du projet et tout ce qu’il contient à la corbeille du système ; une question est posée d’abord',
    )
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FolderEntry } from '@shared/domain/folder'
import { installFakeBridge } from '@/services/fakeBridge'
import { useFolderRoles } from '@/stores/folderRoles'
import { FolderPicker } from './FolderPicker'

const LABELS = {
  columns: 'Emplacement',
  empty: 'Aucun sous-dossier',
  newFolder: 'Nouveau dossier',
  newFolderName: 'Nouveau dossier',
  newFolderLabel: 'Nom du dossier',
  create: 'Créer',
  cancel: 'Annuler',
  folderTaken: 'Ce dossier contient déjà un dossier de ce nom.',
  folderFailed: 'Ce dossier n’a pas pu être créé.',
}

const FOLDERS: Record<string, readonly FolderEntry[]> = {
  '': [
    { path: '3D', name: '3D', kind: 'folder' },
    { path: 'Images', name: 'Images', kind: 'folder' },
    { path: 'lisezmoi.txt', name: 'lisezmoi.txt', kind: 'file' },
    // A layered image is a container — one FILE, whatever its extension suggests.
    { path: 'TOTO.ora', name: 'TOTO.ora', kind: 'file' },
  ],
  Images: [
    { path: 'Images/Croquis', name: 'Croquis', kind: 'folder' },
    { path: 'Images/Rendus', name: 'Rendus', kind: 'folder' },
  ],
  'Images/Croquis': [],
}

const listFolder = (folder: string): Promise<FolderEntry[]> =>
  Promise.resolve([...(FOLDERS[folder] ?? [])])

const show = (value = '', onChange = vi.fn()): { onChange: ReturnType<typeof vi.fn> } => {
  render(<FolderPicker value={value} onChange={onChange} rootName="Project1" labels={LABELS} />)
  return { onChange }
}

/** The rows of every column, in the order the columns are drawn. */
const columns = (): string[][] =>
  screen.getAllByRole('listbox').map(list =>
    within(list)
      .getAllByRole('option')
      .map(row => row.textContent ?? ''),
  )

describe('FolderPicker', () => {
  beforeEach(() => {
    installFakeBridge({ project: { listFolder } })
    useFolderRoles.setState({ roles: {} })
  })

  /**
   * The same glyph and the same hue the explorer's tree gives that very folder: a project has ONE
   * colour code, and a browser drawing eight identical grey folders said the section a document
   * lands in is not worth knowing here.
   */
  it('draws a folder that serves a section in the glyph and hue of that section', async () => {
    useFolderRoles.setState({ roles: { image: 'Images' } })
    show()

    const row = await screen.findByRole('option', { name: 'Images' })
    expect(row.querySelector('svg')?.getAttribute('class')).toContain('text-domain-image')

    // And a folder that serves none keeps the plain one — the rule has to refuse something.
    const plain = screen.getByRole('option', { name: '3D' })
    expect(plain.querySelector('svg')?.getAttribute('class')).not.toContain('text-domain')
  })

  it('opens on the project folder, in one column', async () => {
    show()

    expect(await screen.findByRole('option', { name: 'Images' })).toBeInTheDocument()
    expect(columns()).toHaveLength(1)
  })

  it('offers no file, container or not', async () => {
    show()

    await screen.findByRole('option', { name: 'Images' })
    expect(screen.queryByRole('option', { name: /lisezmoi/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /TOTO/ })).not.toBeInTheDocument()
  })

  // The whole point of columns: what a folder holds opens BESIDE it, not under it.
  it('opens a column per level of the walk', async () => {
    show('Images')

    await screen.findByRole('option', { name: 'Croquis' })
    expect(columns()).toHaveLength(2)
    expect(columns()[1]).toEqual(['Croquis', 'Rendus'])
  })

  // Where you are IS where it goes: there is one notion, not two.
  it('answers with the folder that was picked', async () => {
    const { onChange } = show()

    await userEvent.click(await screen.findByRole('option', { name: 'Images' }))

    expect(onChange).toHaveBeenCalledWith('Images')
  })

  it('marks the row the walk went through, so the way down stays readable', async () => {
    show('Images')

    expect(await screen.findByRole('option', { name: 'Images' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('says a folder holds no sub-folder rather than showing a blank column', async () => {
    show('Images/Croquis')

    expect(await screen.findByText('Aucun sous-dossier')).toBeInTheDocument()
  })

  it('writes the path the document will take', async () => {
    show('Images/Croquis')

    expect(await screen.findByText('Project1 / Images / Croquis')).toBeInTheDocument()
  })

  it('makes a folder where the columns point, and moves into it', async () => {
    const newFolder = vi.fn(() =>
      Promise.resolve({ done: [{ from: '', to: 'Images/Neuf' }], refused: [], batch: 'b' }),
    )
    installFakeBridge({ project: { listFolder, newFolder } })
    const { onChange } = show('Images')

    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau dossier' }))
    await userEvent.clear(screen.getByRole('textbox', { name: 'Nom du dossier' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Nom du dossier' }), 'Neuf')
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))

    expect(newFolder).toHaveBeenCalledWith('Images', 'Neuf')
    expect(onChange).toHaveBeenCalledWith('Images/Neuf')
  })

  it('gives up on the folder without making one', async () => {
    const newFolder = vi.fn(() => Promise.resolve({ done: [], refused: [], batch: 'b' }))
    installFakeBridge({ project: { listFolder, newFolder } })
    show('Images')

    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau dossier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(newFolder).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Nom du dossier' })).not.toBeInTheDocument()
  })

  // Said where it was asked for rather than swallowed: a name the folder already holds is the
  // ordinary refusal, and a gesture that runs its course and does nothing is the worst outcome.
  it('says why a folder was refused, and keeps the field open', async () => {
    installFakeBridge({
      project: {
        listFolder,
        newFolder: () =>
          Promise.resolve({ done: [], refused: [{ path: 'Neuf', reason: 'exists' }], batch: 'b' }),
      },
    })
    show('Images')

    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau dossier' }))
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(LABELS.folderTaken)
    expect(screen.getByRole('textbox', { name: 'Nom du dossier' })).toBeInTheDocument()
  })
})

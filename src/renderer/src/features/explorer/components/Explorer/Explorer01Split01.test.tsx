import { installFakeBridge } from '@/services/fakeBridge'
import { useFolderRoles } from '@/stores/folderRoles'
import { useProject } from '@/stores/project'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  declareGauge,
  Explorer,
  file,
  folder,
  install,
  listing,
  scene,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer', () => {
  describe('a folder serving a section', () => {
    it('says which section it serves, under the name the disk gives it', async () => {
      withProject()
      useFolderRoles.setState({ roles: { models: 'Mes modèles' } })
      install({ '': [folder('Mes modèles')] })
      render(<Explorer />)

      const row = await within(await listing()).findByText('Mes modèles')

      expect(row.closest('[data-tooltip-content]')).toHaveAttribute(
        'data-tooltip-content',
        'Modèles de la section Modélisation',
      )
    })

    /** A fresh folder wearing the old default name is an ordinary folder, and says nothing. */
    it('says nothing for a folder no role was resolved to', async () => {
      withProject()
      useFolderRoles.setState({ roles: { image: 'Photos' } })
      install({ '': [folder('Images')] })
      render(<Explorer />)

      const row = await within(await listing()).findByText('Images')

      expect(row.closest('[data-tooltip-content]')).toBeNull()
    })
  })

  it('says so when no project is open, rather than listing nothing', () => {
    render(<Explorer />)
    expect(screen.getByText(/Aucun projet ouvert/)).toBeInTheDocument()
  })

  it('offers nothing before the main process has said whether there is one', () => {
    useProject.setState({ project: null, known: false })

    render(<Explorer />)

    expect(screen.queryByText(/Aucun projet ouvert/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Créer un projet' })).toBeNull()
  })

  describe('with no project open', () => {
    it('offers both ways out of an empty studio', () => {
      render(<Explorer />)

      expect(screen.getByRole('button', { name: 'Ouvrir un projet' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Créer un projet' })).toBeInTheDocument()
    })

    // The panel is mounted with no project too, and the window comes back to the front all the
    // same: a read then would ask the main process for the folder of a project nobody opened.
    it('asks the disk for nothing when the window comes back', async () => {
      const { listFolder } = install({ '': [file('one.txt')] })

      render(<Explorer />)
      window.dispatchEvent(new Event('focus'))
      await waitFor(() => expect(screen.getByText(/Aucun projet ouvert/)).toBeInTheDocument())

      expect(listFolder).not.toHaveBeenCalled()
    })

    it('picks a folder to open', async () => {
      const openPicked = vi.fn(() => Promise.resolve())
      useProject.setState({ openPicked })

      render(<Explorer />)
      await userEvent.click(screen.getByRole('button', { name: 'Ouvrir un projet' }))

      expect(openPicked).toHaveBeenCalled()
    })

    it('picks a folder to create one in', async () => {
      const createPicked = vi.fn(() => Promise.resolve())
      useProject.setState({ createPicked })

      render(<Explorer />)
      await userEvent.click(screen.getByRole('button', { name: 'Créer un projet' }))

      expect(createPicked).toHaveBeenCalled()
    })
  })

  describe('with a project open', () => {
    it('shows the project folder rather than a list of documents', async () => {
      withProject()
      install({ '': [folder('assets'), folder('documents'), file('notes.txt')] })

      render(<Explorer />)

      expect(await within(await listing()).findByText('assets')).toBeInTheDocument()
      expect(screen.getByText('documents')).toBeInTheDocument()
      expect(screen.getByText('notes.txt')).toBeInTheDocument()
    })

    // `assets/img` holds thousands of files in an ordinary project. Reading it because it is
    // there, rather than because someone opened it, is the cost this design exists to avoid.
    it('reads a folder only once it is opened', async () => {
      withProject()
      const { listFolder } = install({
        '': [folder('assets')],
        assets: [folder('img', 'assets')],
      })

      render(<Explorer />)
      await within(await listing()).findByText('assets')

      expect(listFolder).toHaveBeenCalledTimes(1)
      expect(listFolder).toHaveBeenCalledWith('', false)
    })

    it('reads it when it is opened, and shows what it holds', async () => {
      withProject()
      install({ '': [folder('assets')], assets: [file('boulder.png', 'assets')] })

      render(<Explorer />)
      await userEvent.click(await within(await listing()).findByText('assets'))
      await userEvent.keyboard('{ArrowRight}')

      expect(await screen.findByText('boulder.png')).toBeInTheDocument()
    })

    /**
     * A folder nobody has opened has no children LOADED, which is not the same as having none.
     * Read the first way, it draws no chevron and can never be opened at all.
     */
    it('offers to open a folder it has not read yet', async () => {
      withProject()
      install({ '': [folder('assets')] })

      render(<Explorer />)
      await within(await listing()).findByText('assets')

      expect(screen.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'false')
    })

    /**
     * A folder is read as a list of names, and it used to be measured for a second line that one
     * row in thirty carried — the word « open » under a document the studio has a tab on. `Tree`
     * is handed a NUMBER for its estimate, so every row in the panel stood at the taller gauge:
     * 36px against a control's 28, five or six fewer folders on screen. The word went on
     * 2026-08-14 and the mark it repeated — a dot of accent in the pinned column — stayed.
     */
    it('measures its rows as a control, not as a stack of two lines', async () => {
      withProject()
      install({ '': [file('a3f1.gltf')] }, [scene])
      // Declared, so the assertion answers to the STYLESHEET rather than to the fallback the
      // suite would otherwise compare with itself. Compact values, where the overflow bit.
      declareGauge('--sc-control', '24px')
      declareGauge('--sc-row-stacked', '32px')

      render(<Explorer />)
      await screen.findByText('Niveau')

      const row = screen.getByRole('treeitem').closest('li')
      expect(row).toHaveStyle({ height: '24px' })
    })

    it('closes a folder again, and its contents go with it', async () => {
      withProject()
      install({ '': [folder('assets')], assets: [file('one.png', 'assets')] })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('assets'))
      await within(await listing()).findByText('one.png')
      await userEvent.dblClick(within(await listing()).getByText('assets'))

      await waitFor(async () =>
        expect(within(await listing()).queryByText('one.png')).not.toBeInTheDocument(),
      )
    })

    it('keeps nested folders closed when their parent is reopened', async () => {
      withProject()
      install({
        '': [folder('assets')],
        assets: [folder('images', 'assets')],
        'assets/images': [file('one.png', 'assets/images')],
      })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('assets'))
      await userEvent.dblClick(await within(await listing()).findByText('images'))
      await within(await listing()).findByText('one.png')
      await userEvent.dblClick(within(await listing()).getByText('assets'))
      await userEvent.dblClick(within(await listing()).getByText('assets'))

      expect(await within(await listing()).findByText('images')).toBeInTheDocument()
      expect(within(await listing()).queryByText('one.png')).not.toBeInTheDocument()
    })

    // Every path in the tree named the folder just left: kept a frame longer, its rows are
    // clickable and lead nowhere.
    it('drops the whole tree when another project opens', async () => {
      withProject()
      install({ '': [file('first.txt')] })
      const { rerender } = render(<Explorer />)
      await screen.findByText('first.txt')

      install({ '': [file('second.txt')] })
      useProject.setState({
        project: {
          path: '/projects/other',
          manifest: { version: 1, createdAt: '', updatedAt: '' },
        },
      })
      rerender(<Explorer />)

      expect(await screen.findByText('second.txt')).toBeInTheDocument()
      expect(screen.queryByText('first.txt')).not.toBeInTheDocument()
    })

    // A plain browser has no bridge, and neither does a window before the preload answers.
    it('draws its empty state rather than throwing with nothing to ask', async () => {
      withProject()
      vi.unstubAllGlobals()

      render(<Explorer />)

      expect(await screen.findByText(/n’a pas pu être lu/)).toBeInTheDocument()
    })

    // Often it is the disk event itself that says the folder went. It contributes nothing
    // rather than failing the whole pass.
    it('keeps its footing when a folder will not answer', async () => {
      withProject()
      installFakeBridge({
        project: {
          listFolder: (relative: string) =>
            relative === ''
              ? Promise.resolve([folder('assets'), file('notes.txt')])
              : Promise.reject(new Error('gone')),
        },
      })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('assets'))

      expect(screen.getByText('notes.txt')).toBeInTheDocument()
    })

    it('draws no chevron on a file', async () => {
      withProject()
      install({ '': [file('notes.txt')] })

      render(<Explorer />)
      await screen.findByText('notes.txt')

      expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded')
    })
  })
})

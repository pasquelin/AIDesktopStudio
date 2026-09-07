import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  montage,
  openDocument,
  picture,
  scene,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer', () => {
  describe('opening what a row names', () => {
    it('opens a document of the project, tab or no tab', async () => {
      withProject()
      const filed = { ...scene, path: 'documents/a3f1.gltf' }
      install({ '': [folder('documents')], documents: [file('a3f1.gltf', 'documents')] }, [filed])

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('documents'))
      await userEvent.dblClick(await screen.findByText('Niveau'))

      expect(openDocument).toHaveBeenCalledWith(filed)
    })

    it('tells two documents of the same name in two folders apart', async () => {
      withProject()
      const here = { ...scene, id: 'here', title: 'Ici', path: 'Acte 1/a3f1.gltf' }
      const there = { ...scene, id: 'there', title: 'Là', path: 'Acte 2/a3f1.gltf' }
      install(
        {
          '': [folder('Acte 1'), folder('Acte 2')],
          'Acte 1': [file('a3f1.gltf', 'Acte 1')],
          'Acte 2': [file('a3f1.gltf', 'Acte 2')],
        },
        [here, there],
      )

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('Acte 2'))
      await userEvent.dblClick(await screen.findByText('Là'))

      expect(openDocument).toHaveBeenCalledWith(there)
    })

    it('opens an image document rather than folding it open', async () => {
      withProject()
      install({ '': [file('a3f1.ora')] }, [picture])

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('Planche'))

      expect(openDocument).toHaveBeenCalledWith(picture)
      expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded')
    })

    it('opens a montage held in the open format', async () => {
      withProject()
      const { openFile } = install({ '': [file('Bande.otio')] }, [montage])

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('Bande'))

      expect(openDocument).toHaveBeenCalledWith(montage)
      expect(openFile).not.toHaveBeenCalled()
    })

    it('hands a file it cannot open to the system', async () => {
      withProject()
      const { openFile } = install({ '': [file('brief.pdf')] })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('brief.pdf'))

      expect(openFile).toHaveBeenCalledWith('brief.pdf')
      expect(openDocument).not.toHaveBeenCalled()
    })
  })
})

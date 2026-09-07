import { useDocuments } from '@/stores/documents'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  openDocument,
  scene,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer', () => {
  describe('opening what a row names', () => {
    it('does not take a document extension for a document', async () => {
      withProject()
      const { openFile } = install({ '': [file('stray.gltf')] })

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('stray.gltf'))

      expect(openDocument).not.toHaveBeenCalled()
      expect(openFile).toHaveBeenCalledWith('stray.gltf')
    })

    it('takes a file with no extension for what it is', async () => {
      withProject()
      const { openFile } = install({ '': [file('README')] })

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('README'))

      expect(openFile).toHaveBeenCalledWith('README')
      expect(openDocument).not.toHaveBeenCalled()
    })

    it('says nothing when the bridge went away between the listing and the click', async () => {
      withProject()
      install({ '': [file('brief.pdf')] })

      render(<Explorer />)
      await within(await listing()).findByText('brief.pdf')
      vi.unstubAllGlobals()

      await expect(
        userEvent.dblClick(within(await listing()).getByText('brief.pdf')),
      ).resolves.toBeUndefined()
    })

    it('opens a folder rather than handing it to the system', async () => {
      withProject()
      const { openFile } = install({ '': [folder('assets')], assets: [file('one.png', 'assets')] })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('assets'))

      expect(await within(await listing()).findByText('one.png')).toBeInTheDocument()
      expect(openFile).not.toHaveBeenCalled()
    })

    it('marks the documents a tab is showing, and them alone', async () => {
      withProject()
      useDocuments.setState({ documents: { a3f1: scene } })
      install({ '': [file('a3f1.gltf'), file('other.gltf')] }, [scene])

      render(<Explorer />)
      await screen.findByText('Niveau')

      const marked = (name: string): Element | null | undefined =>
        screen.getByText(name).closest('[role="treeitem"]')?.querySelector('.text-accent-ink')

      // `Niveau` is the document's name; `other.gltf` is a file no descriptor came back for,
      // so it keeps the name the folder gives it.
      expect(marked('Niveau')).toBeInTheDocument()
      expect(marked('other.gltf')).not.toBeInTheDocument()
    })
  })
})

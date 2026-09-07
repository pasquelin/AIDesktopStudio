import { useDocuments } from '@/stores/documents'
import { useExplorerView } from '@/stores/explorerView'
import { render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  menu,
  scene,
  withProject,
} from './explorerTest-fixtures'

describe('the explorer menu', () => {
  const open = async (name: string): Promise<void> => {
    await userEvent.pointer({
      keys: '[MouseRight]',
      target: await within(await listing()).findByText(name),
    })
  }

  it('shows a file in the system file manager', async () => {
    withProject()
    const { revealFile } = install({ '': [file('brief.pdf')] })
    menu.picks('Afficher dans le dossier')

    render(<Explorer />)
    await open('brief.pdf')

    await waitFor(() => expect(revealFile).toHaveBeenCalledWith('brief.pdf'))
  })

  it('opens the information window on the entry that was right-clicked', async () => {
    withProject()
    const { openFileInfo } = install({ '': [file('brief.pdf'), file('a.png')] })
    menu.picks('Informations sur le fichier')

    render(<Explorer />)
    await open('brief.pdf')

    await waitFor(() => expect(openFileInfo).toHaveBeenCalledWith('brief.pdf'))
  })

  it('offers the information window on a file and greys it on a folder', async () => {
    withProject()
    install({ '': [folder('Notes'), file('brief.pdf')] })

    render(<Explorer />)
    await open('brief.pdf')
    expect(menu.offers('Informations sur le fichier')).toBe(true)

    await open('Notes')
    expect(menu.labels()).toContain('Informations sur le fichier')
    expect(menu.offers('Informations sur le fichier')).toBe(false)
  })

  it('moves a file to the trash rather than deleting it', async () => {
    withProject()
    const { trashFiles } = install({ '': [file('brief.pdf')] })
    menu.picks('Mettre à la corbeille')

    render(<Explorer />)
    await open('brief.pdf')

    await waitFor(() => expect(trashFiles).toHaveBeenCalledWith(['brief.pdf']))
  })

  it('offers every gesture on the folders a project used to be laid out by', async () => {
    withProject()
    install({ '': [folder('assets')] })

    render(<Explorer />)
    await open('assets')

    await waitFor(() => expect(menu.offers('Renommer')).toBe(true))
    expect(menu.offers('Mettre à la corbeille')).toBe(true)
  })

  it('greys every gesture out on what the studio keeps under a dot', async () => {
    withProject()
    useExplorerView.setState({ hidden: true })
    install({ '': [file('.project.json')] })

    render(<Explorer />)
    await open('.project.json')

    await waitFor(() => expect(menu.offers('Renommer')).toBe(false))
    expect(menu.offers('Mettre à la corbeille')).toBe(false)
    expect(menu.offers('Dupliquer')).toBe(false)
    expect(menu.offers('Couper')).toBe(false)
  })

  it('renames a document a tab is holding', async () => {
    withProject()
    useDocuments.setState({ documents: { a3f1: scene } })
    install({ '': [file('a3f1.gltf')] }, [scene])

    render(<Explorer />)
    await open('Niveau')

    await waitFor(() => expect(menu.offers('Renommer')).toBe(true))
  })
})

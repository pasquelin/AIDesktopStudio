import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  menu,
  openDocument,
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

  it('renames a file the catalogue never heard of, wherever it sits', async () => {
    withProject()
    install({ '': [folder('assets')], assets: [file('dropped.png', 'assets')] })

    render(<Explorer />)
    await userEvent.dblClick(await within(await listing()).findByText('assets'))
    await open('dropped.png')

    await waitFor(() => expect(menu.offers('Renommer')).toBe(true))
    expect(menu.offers('Mettre à la corbeille')).toBe(true)
  })

  it('renames where the name is read', async () => {
    withProject()
    const { renameFile } = install({ '': [file('brief.pdf')] })
    menu.picks('Renommer')

    render(<Explorer />)
    await open('brief.pdf')
    const field = await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.clear(field)
    await userEvent.type(field, 'note.pdf{Enter}')

    expect(renameFile).toHaveBeenCalledWith('brief.pdf', 'note.pdf')
  })

  it('asks for nothing when the name was left as it was', async () => {
    withProject()
    const { renameFile } = install({ '': [file('brief.pdf')] })
    menu.picks('Renommer')

    render(<Explorer />)
    await open('brief.pdf')
    await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.keyboard('{Escape}')

    expect(renameFile).not.toHaveBeenCalled()
  })

  it('leaves the row alone while its name is being typed in', async () => {
    withProject()
    install({ '': [file('a3f1.gltf')] }, [scene])
    menu.picks('Renommer')

    render(<Explorer />)
    await open('Niveau')
    const field = await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.dblClick(field)

    expect(openDocument).not.toHaveBeenCalled()
  })
})

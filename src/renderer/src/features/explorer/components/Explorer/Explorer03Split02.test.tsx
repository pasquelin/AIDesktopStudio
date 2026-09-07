import { installFakeBridge } from '@/services/fakeBridge'
import type { Asset } from '@shared/domain/asset'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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

  it('renames a document through its own channel, never as a plain file', async () => {
    withProject()
    const { renameFile } = install({ '': [file('a3f1.gltf')] }, [scene])
    const rename = vi.fn(() => Promise.resolve({ ...scene, title: 'Décor' }))
    installFakeBridge({
      project: { listFolder: () => Promise.resolve([file('a3f1.gltf')]) },
      documents: { list: () => Promise.resolve([scene]), rename },
      menu: menu.bridge,
    })
    menu.picks('Renommer')

    render(<Explorer />)
    await open('Niveau')
    const field = await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Décor{Enter}')

    expect(rename).toHaveBeenCalledWith('a3f1', 'scene', 'Décor')
    expect(renameFile).not.toHaveBeenCalled()
  })

  it('renames an asset through the catalogue, never as a plain file', async () => {
    withProject()
    const boulder: Asset = {
      id: 'asset_1',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      path: 'assets/Boulder.png',
      tags: [],
      createdAt: '2026-08-16T10:00:00.000Z',
    }
    const { renameFile, update } = install(
      { '': [folder('assets')], assets: [file('Boulder.png', 'assets')] },
      [],
      [boulder],
    )
    menu.picks('Renommer')

    render(<Explorer />)
    await userEvent.dblClick(await within(await listing()).findByText('assets'))
    await open('Boulder.png')
    const field = await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Ruelle bleue.png{Enter}')

    // The stem, without the extension the panel draws: the suffix follows the bytes, and a name
    // carrying one would grow a second on the next rename — `Ruelle.png.png`.
    await waitFor(() => expect(update).toHaveBeenCalledWith('asset_1', { name: 'Ruelle bleue' }))
    expect(renameFile).not.toHaveBeenCalled()
  })

  it('offers the gesture on a file the catalogue holds', async () => {
    withProject()
    install(
      { '': [folder('assets')], assets: [file('Boulder.png', 'assets')] },
      [],
      [
        {
          id: 'asset_1',
          name: 'Boulder',
          type: 'image',
          location: 'local',
          path: 'assets/Boulder.png',
          tags: [],
          createdAt: '2026-08-16T10:00:00.000Z',
        },
      ],
    )

    render(<Explorer />)
    await userEvent.dblClick(await within(await listing()).findByText('assets'))
    await open('Boulder.png')

    await waitFor(() => expect(menu.offers('Renommer')).toBe(true))
  })
})

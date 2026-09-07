import { startAssetDrag } from '@/helpers/assetDrag'
import { LIST_ONLY } from '@/helpers/collectionState'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { useAssets } from '@/stores/assets'
import { useExplorerView } from '@/stores/explorerView'
import type { Asset } from '@shared/domain/asset'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  menu,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer, as a grid', () => {
  const showGrid = (): void =>
    void useExplorerView.setState({ collection: { ...LIST_ONLY, view: 'grid' } })

  const tileFor = async (name: string): Promise<HTMLElement> => {
    const caption = await within(await listing()).findByText(name)
    const tile = caption.closest('[draggable]')
    if (!(tile instanceof HTMLElement)) throw new Error(`no tile for ${name}`)
    return tile
  }

  const blank = (): HTMLElement => {
    const host = screen.getByRole('listbox').parentElement
    if (!(host instanceof HTMLElement)) throw new Error('no blank to aim at')
    return host
  }

  const enter = async (name: string): Promise<void> => {
    await userEvent.dblClick(await screen.findByText(name))
  }

  it('renames a tile in place', async () => {
    withProject()
    showGrid()
    const { renameFile } = install({ '': [file('brief.pdf')] })

    render(<Explorer />)
    menu.picks('Renommer')
    fireEvent.contextMenu(await tileFor('brief.pdf'))

    const field = await screen.findByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'resume.pdf{Enter}')

    expect(renameFile).toHaveBeenCalledWith('brief.pdf', 'resume.pdf')
  })

  describe('an asset dragged in from the shelf', () => {
    const shelfAsset: Asset = {
      id: 'asset_moss',
      name: 'moss.png',
      type: 'image',
      location: 'local',
      path: 'Images/moss.png',
      tags: [],
      createdAt: '2026-08-17T10:00:00.000Z',
    }

    const carrying = (): DataTransfer => {
      const data = dragTransfer()
      startAssetDrag({ dataTransfer: data }, shelfAsset)
      return data
    }

    const rowFor = async (name: string): Promise<HTMLElement> => {
      const row = (await within(await listing()).findByText(name)).closest('[role="treeitem"]')
      if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`)
      return row
    }

    beforeEach(() => {
      useAssets.setState({ items: [shelfAsset] })
    })

    it('lands its file in the folder tile it was dropped on', async () => {
      withProject()
      showGrid()
      const { moveFiles } = install({ '': [folder('Croquis')] })

      render(<Explorer />)
      fireEvent.drop(await tileFor('Croquis'), { dataTransfer: carrying() })

      await waitFor(() => expect(moveFiles).toHaveBeenCalledWith(['Images/moss.png'], 'Croquis'))
    })

    it('lands it in the folder on screen when it is dropped on the blank', async () => {
      withProject()
      showGrid()
      const { moveFiles } = install({
        '': [folder('Croquis')],
        Croquis: [file('note.txt', 'Croquis')],
      })

      render(<Explorer />)
      await enter('Croquis')
      await screen.findByText('note.txt')

      fireEvent.drop(blank(), { dataTransfer: carrying() })

      await waitFor(() => expect(moveFiles).toHaveBeenCalledWith(['Images/moss.png'], 'Croquis'))
    })

    // An asset lands IN a place, and a file is not one — the tile takes no outline and no drop.
    it('is refused by a file', async () => {
      withProject()
      showGrid()
      const { moveFiles } = install({ '': [file('brief.pdf')] })

      render(<Explorer />)
      fireEvent.drop(await tileFor('brief.pdf'), { dataTransfer: carrying() })

      await waitFor(() => expect(moveFiles).not.toHaveBeenCalled())
    })

    it('lands its file in the folder ROW it was dropped on, the list reading alike', async () => {
      withProject()
      const { moveFiles } = install({ '': [folder('Croquis')] })

      render(<Explorer />)
      fireEvent.drop(await rowFor('Croquis'), { dataTransfer: carrying() })

      await waitFor(() => expect(moveFiles).toHaveBeenCalledWith(['Images/moss.png'], 'Croquis'))
    })
  })
})

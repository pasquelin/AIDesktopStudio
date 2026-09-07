import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  openAsset,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer', () => {
  describe('opening what a row names', () => {
    it('opens an asset in its own editor rather than in another application', async () => {
      withProject()
      const { openFile } = install(
        { '': [folder('assets')], assets: [file('boulder.png', 'assets')] },
        [],
        [
          {
            id: 'asset_1',
            name: 'Gemini 3.1',
            type: 'image',
            location: 'local',
            path: 'assets/boulder.png',
            tags: [],
            createdAt: '2026-08-12T10:00:00.000Z',
          },
        ],
      )

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('assets'))
      await userEvent.dblClick(await screen.findByText('boulder.png'))

      await waitFor(() => expect(openAsset).toHaveBeenCalledTimes(1))
      expect(vi.mocked(openAsset).mock.calls[0]?.[0]).toMatchObject({ id: 'asset_1' })
      expect(openFile).not.toHaveBeenCalled()
    })

    it('adopts a picture the catalogue has never heard of, and opens it here', async () => {
      withProject()
      const { openFile, adopt } = install({
        '': [folder('Images')],
        Images: [file('facade.jpg', 'Images')],
      })

      render(<Explorer />)
      await userEvent.dblClick(await within(await listing()).findByText('Images'))
      await userEvent.dblClick(await within(await listing()).findByText('facade.jpg'))

      await waitFor(() => expect(openAsset).toHaveBeenCalledTimes(1))
      expect(adopt).toHaveBeenCalledWith('Images/facade.jpg')
      expect(vi.mocked(openAsset).mock.calls[0]?.[0]).toMatchObject({ path: 'Images/facade.jpg' })
      expect(openFile).not.toHaveBeenCalled()
    })

    it('draws a preview in the tree too, and leaves a folder its glyph', async () => {
      withProject()
      install({ '': [folder('Images'), file('facade.jpg')] })

      render(<Explorer />)
      const rowFor = async (name: string): Promise<HTMLElement> => {
        const row = (await within(await listing()).findByText(name)).closest('[role="treeitem"]')
        if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`)
        return row
      }

      expect((await rowFor('facade.jpg')).querySelector('img')).toHaveAttribute(
        'src',
        'ai-desktop-studio://thumb/facade.jpg',
      )
      expect((await rowFor('Images')).querySelector('img')).toBeNull()
    })

    it('still hands a file it has no editor for to the system', async () => {
      withProject()
      const { openFile } = install({ '': [folder('Notes')], Notes: [file('brief.txt', 'Notes')] })

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('Notes'))
      await userEvent.dblClick(await screen.findByText('brief.txt'))

      await waitFor(() => expect(openFile).toHaveBeenCalledWith('Notes/brief.txt'))
      expect(openAsset).not.toHaveBeenCalled()
    })

    it('hands nothing to the system when the adoption could not be answered', async () => {
      withProject()
      const { openFile, adopt } = install({ '': [file('car.glb')] })
      adopt.mockRejectedValueOnce(new Error('catalogue busy'))

      render(<Explorer />)
      await userEvent.dblClick(await screen.findByText('car.glb'))

      await waitFor(() => expect(adopt).toHaveBeenCalledWith('car.glb'))
      expect(openFile).not.toHaveBeenCalled()
      expect(openAsset).not.toHaveBeenCalled()
    })
  })
})

import { installFakeBridge } from '@/services/fakeBridge'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { FileOutcome } from '@shared/domain/fileOp'
import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Explorer, file, install, withProject } from './explorerTest-fixtures'

describe('the project explorer', () => {
  describe('following the disk', () => {
    it('reads again when the main process says the folder changed', async () => {
      withProject()
      let announce = (): void => undefined
      const listFolder = vi.fn(() => Promise.resolve([file('one.txt')]))
      installFakeBridge({
        project: {
          listFolder,
          onFolderChanged: callback => {
            announce = callback
            return () => undefined
          },
        },
      })

      render(<Explorer />)
      await screen.findByText('one.txt')
      listFolder.mockResolvedValue([file('two.txt')])
      announce()

      expect(await screen.findByText('two.txt')).toBeInTheDocument()
      expect(screen.queryByText('one.txt')).not.toBeInTheDocument()
    })

    /**
     * The third thing a settled batch does, and the only conditional one. The panel that lists
     * documents walks the disk rather than a row, so a `.gltf` sent to the trash by another
     * window stays listed until this asks again — and a batch of rushes must NOT pay for it.
     *
     * Counts calls, so it rests on `relist` opening a listing rather than joining one in flight.
     * `listing` lives at module scope in the store and no hook resets it: were a case before this
     * one to leave a listing pending, the second batch would join it and never call again.
     */
    it('lists the documents again only when the batch reached one', async () => {
      withProject()
      let announce = (_outcome: FileOutcome): void => undefined
      const listDocuments = vi.fn(() => Promise.resolve<DocumentDescriptor[]>([]))
      installFakeBridge({
        project: {
          listFolder: () => Promise.resolve([file('one.txt')]),
          onFilesChanged: callback => {
            announce = callback
            return () => undefined
          },
        },
        documents: { list: listDocuments },
      })

      render(<Explorer />)
      await screen.findByText('one.txt')
      // Spelt out rather than captured: the panel lists once on mount, and a count taken from
      // the panel itself would follow it into silence if that ever stopped.
      expect(listDocuments).toHaveBeenCalledTimes(1)

      const moved = { from: 'rushes/a.png', to: 'b/a.png' }
      await act(async () => {
        announce({ done: [moved], refused: [], batch: 'batch-1' })
      })
      expect(listDocuments).toHaveBeenCalledTimes(1)

      const trashed = { from: 'Act 1/opening.gltf', to: '' }
      await act(async () => {
        announce({ done: [trashed], refused: [], batch: 'batch-2' })
      })
      expect(listDocuments).toHaveBeenCalledTimes(2)
    })

    // Not a duplicate of the watch: a recursive watch is not offered everywhere, and a project
    // on a network volume can emit nothing at all.
    it('reads again when the window comes back to the front', async () => {
      withProject()
      const { listFolder } = install({ '': [file('one.txt')] })

      render(<Explorer />)
      await screen.findByText('one.txt')
      window.dispatchEvent(new Event('focus'))

      await waitFor(() => expect(listFolder).toHaveBeenCalledTimes(2))
    })
  })
})

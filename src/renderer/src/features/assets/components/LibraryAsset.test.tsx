import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudAsset } from '@shared/domain/cloudAsset'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useCloud } from '@/stores/cloud'
import { useLibraryPick } from '@/stores/libraryPick'
import { useProject } from '@/stores/project'
import { LibraryAsset } from './LibraryAsset'

const asset: CloudAsset = {
  id: 'asset_remote',
  name: 'skeleton',
  type: 'mesh',
  remoteType: 'img23d',
  ownerId: 'proj_1',
  createdAt: '2026-08-12T11:00:00.000Z',
  updatedAt: '2026-08-12T11:00:00.000Z',
  privacy: 'private',
  tags: [],
  collectionIds: [],
}

const FETCH = 'Télécharger 1 asset'

let menu = fakeMenu()

function open(picked: readonly string[] = []) {
  useLibraryPick.setState({ picked })
  render(
    <LibraryAsset asset={asset}>
      <span>tile</span>
    </LibraryAsset>,
  )
  const surface = screen.getByText('tile').parentElement as Element
  fireEvent.contextMenu(surface)
  return surface
}

const withProject = (path: string | null): void => {
  useProject.setState({
    project:
      path === null ? null : { path, manifest: { version: 1, createdAt: '', updatedAt: '' } },
  })
}

describe('a library line the catalogue does not hold', () => {
  beforeEach(() => {
    useCloud.getState().clear()
    menu = fakeMenu()
    installFakeBridge({ menu: menu.bridge })
    withProject('/Users/someone/Reel.aidesktopstudio')
  })

  it('offers the one thing the line is for', async () => {
    open()

    await vi.waitFor(() => expect(menu.labels()).toEqual([FETCH]))
  })

  /**
   * Greyed rather than hidden, as every other menu here: an entry that comes and goes with the
   * context is one nobody can learn. Without a project there is no folder to write into.
   */
  it('greys the entry out when there is nowhere to write the file', async () => {
    withProject(null)
    open()

    await vi.waitFor(() => expect(menu.offers(FETCH)).toBe(false))
  })

  // One transfer at a time is `useCloud`'s own rule; the menu says so rather than starting a
  // second one that the store would silently refuse.
  it('greys the entry out while another transfer is running', async () => {
    useCloud.setState({ busy: true })
    open()

    await vi.waitFor(() => expect(menu.offers(FETCH)).toBe(false))
  })

  /**
   * Dragged like a local one, under the same kind: what a target accepts is the mesh, not where
   * its bytes are. The download happens at the drop, which is what makes the library half of
   * the browser usable rather than a shelf one can only look at.
   */
  it('can be dragged, and announces the kind a target decides on', () => {
    render(
      <LibraryAsset asset={asset}>
        <span>tile</span>
      </LibraryAsset>,
    )
    const dataTransfer = dragTransfer()

    fireEvent.dragStart(screen.getByText('tile').parentElement as Element, { dataTransfer })

    expect(dataTransfer.types).toContain('application/x-ai-desktop-studio-asset+mesh')
    // The marker that tells the drop it has a download to do first.
    expect(dataTransfer.types).toContain('application/x-ai-desktop-studio-asset+library')
  })

  // The one action the line is for, and the only one it can do: bring the bytes in.
  it('fetches the asset when the entry is chosen', async () => {
    let pulled: readonly string[] = []
    installFakeBridge({
      menu: menu.bridge,
      cloud: {
        pull: ids => {
          pulled = ids
          return Promise.resolve([{ assetId: 'asset_remote', ok: true }])
        },
      },
    })
    menu.picks(FETCH)

    open()

    await vi.waitFor(() => expect(pulled).toEqual(['asset_remote']))
  })

  /**
   * One transfer at a time is `useCloud`'s own rule, so twelve picked lines have to come down in
   * ONE gesture — twelve clicks would be eleven refusals.
   *
   * 🛑 Seeded with what the panel actually writes — the ROW ids `Collection` hands it, prefixed —
   * and asserted on the LIBRARY ids a transfer takes. Seeded with bare ids, this case never met
   * the real value, and the range silently fell back to the one line clicked.
   */
  it('brings down the whole picked range in one transfer, by the library’s own ids', async () => {
    let pulled: readonly string[] = []
    installFakeBridge({
      menu: menu.bridge,
      cloud: {
        pull: ids => {
          pulled = ids
          return Promise.resolve([])
        },
      },
    })
    menu.picks('Télécharger 3 assets')

    open(['remote:asset_remote', 'remote:asset_b', 'remote:asset_c'])

    await vi.waitFor(() => expect(pulled).toEqual(['asset_remote', 'asset_b', 'asset_c']))
  })
})

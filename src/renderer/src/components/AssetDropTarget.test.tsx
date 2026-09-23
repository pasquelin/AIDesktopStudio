import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PICTURES, type Asset, type AssetType } from '@shared/domain/asset'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { AssetDropTarget } from './AssetDropTarget'

const asset: Asset = {
  id: 'asset_1',
  name: 'moss.png',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-07T10:00:00.000Z',
}

function dragging(type: AssetType): DataTransfer {
  const dataTransfer = dragTransfer()
  startAssetDrag({ dataTransfer }, { id: 'asset_1', type })
  return dataTransfer
}

function desktopFile(name: string): DataTransfer {
  return desktopFiles([name])
}

function desktopFiles(names: readonly string[]): DataTransfer {
  const dataTransfer = dragTransfer()
  dataTransfer.setData('Files', '')
  Object.defineProperty(dataTransfer, 'files', {
    value: names.map(name => new File(['asset'], name)),
  })
  return dataTransfer
}

/** What Chromium really hands a `dragover`: the store is protected, so no name is readable. */
function protectedDesktopDrag(): DataTransfer {
  const dataTransfer = dragTransfer()
  dataTransfer.setData('Files', '')
  // An EMPTY list, never a missing one: the store is protected, not absent.
  Object.defineProperty(dataTransfer, 'files', { value: [] })
  return dataTransfer
}

function target(accepts: readonly AssetType[], onDrop = vi.fn()) {
  render(
    <AssetDropTarget accepts={accepts} onDrop={onDrop}>
      <span>slot</span>
    </AssetDropTarget>,
  )
  return { surface: screen.getByText('slot').parentElement as Element, onDrop }
}

describe('a surface an asset can be dropped onto', () => {
  beforeEach(() => {
    useAssets.setState({ items: [asset] })
  })

  // The id is all the drag carries; every surface used to resolve it against the catalogue
  // itself, and two of them did it by subscribing — a re-render on every catalogue refresh.
  // Awaited, because the drop resolves through `droppedAsset`: a LIBRARY asset is fetched
  // before it is handed over, so every drop settles a promise even when nothing was fetched.
  it('hands over the asset, not the id the drag carried', async () => {
    const { surface, onDrop } = target(PICTURES)

    fireEvent.drop(surface, { dataTransfer: dragging('image') })

    await waitFor(() => expect(onDrop).toHaveBeenCalledWith(asset))
  })

  it('says nothing when the id names an asset the catalogue does not hold', async () => {
    useAssets.setState({ items: [] })
    const { surface, onDrop } = target(PICTURES)

    fireEvent.drop(surface, { dataTransfer: dragging('image') })

    // Settled rather than asserted straight away: the answer arrives a microtask later, and a
    // synchronous `not.toHaveBeenCalled` would pass even if the drop did hand something over.
    await Promise.resolve()
    expect(onDrop).not.toHaveBeenCalled()
  })

  // Only a prevented dragover makes a drop land. Preventing one we would refuse promises
  // something the drop then quietly fails to do.
  it('lets a drop land only when it would accept it', () => {
    const { surface } = target(['image'])

    const welcome = fireEvent.dragOver(surface, { dataTransfer: dragging('image') })
    const refused = fireEvent.dragOver(surface, { dataTransfer: dragging('audio') })

    // `fireEvent` answers false when the handler called `preventDefault`.
    expect(welcome).toBe(false)
    expect(refused).toBe(true)
  })

  it('never claims a drag that is not ours, so a file from the desktop passes through', () => {
    const { surface } = target(PICTURES)

    expect(fireEvent.dragOver(surface, { dataTransfer: dragTransfer() })).toBe(true)
  })

  it('welcomes a compatible desktop file and refuses an incompatible format in red', () => {
    const { surface } = target(['mesh'])

    expect(fireEvent.dragOver(surface, { dataTransfer: desktopFile('chair.obj') })).toBe(false)
    expect(surface.className).toContain('outline-accent')

    expect(fireEvent.dragOver(surface, { dataTransfer: desktopFile('notes.txt') })).toBe(false)
    expect(surface.className).toContain('outline-danger')
  })

  it('keeps a protected desktop drag neutral until the operating system reveals its name', () => {
    const { surface } = target(['mesh'])
    const transfer = desktopFiles([])

    expect(fireEvent.dragOver(surface, { dataTransfer: transfer })).toBe(false)
    expect(surface.className).not.toContain('outline-accent')
    expect(surface.className).not.toContain('outline-danger')
  })

  it('accepts a drag that announces no kind rather than refusing it', () => {
    // A drop that silently does nothing is worse than one that lands somewhere sensible.
    const dataTransfer = dragTransfer()
    dataTransfer.setData('application/x-ai-desktop-studio-asset', 'asset_1')

    const { surface } = target(['audio'])

    expect(fireEvent.dragOver(surface, { dataTransfer })).toBe(false)
  })

  it('draws its answer while the asset is flying, and drops it again on leaving', () => {
    const { surface } = target(['image'])

    fireEvent.dragOver(surface, { dataTransfer: dragging('image') })
    expect(surface.className).toContain('outline-accent')

    fireEvent.dragOver(surface, { dataTransfer: dragging('audio') })
    expect(surface.className).toContain('outline-danger')

    fireEvent.dragLeave(surface, { relatedTarget: document.body })
    expect(surface.className).not.toContain('outline-')
  })

  // `dragleave` bubbles from every child: crossing from a canvas onto the toolbar above it fired
  // one, and the outline flickered off and back on several times a second during a drag.
  it('holds its outline when the pointer only crosses onto a child', () => {
    const { surface } = target(['image'])
    fireEvent.dragOver(surface, { dataTransfer: dragging('image') })

    fireEvent.dragLeave(surface, { relatedTarget: screen.getByText('slot') })

    expect(surface.className).toContain('outline-accent')
  })

  it('leaves the surface behind it alone when it is exclusive', () => {
    const outer = vi.fn()
    render(
      <div onDrop={outer}>
        <AssetDropTarget accepts={PICTURES} onDrop={vi.fn()} exclusive>
          <span>field</span>
        </AssetDropTarget>
      </div>,
    )

    fireEvent.drop(screen.getByText('field').parentElement as Element, {
      dataTransfer: dragging('image'),
    })

    expect(outer).not.toHaveBeenCalled()
  })

  it('imports a compatible desktop file before handing it to the target', async () => {
    const model: Asset = { ...asset, id: 'asset_2', name: 'chair', type: 'mesh' }
    const ingestPaths = vi.fn(async () => ({
      assets: [model],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    }))
    installFakeBridge({
      externalFiles: {
        offer: async () => ({ request: { id: 'request-1' }, refused: [] }),
      },
      media: { ingestPaths },
    })
    useProject.setState({
      known: true,
      project: {
        path: '/projects/one',
        manifest: {
          version: 1,
          createdAt: '2026-09-03T09:00:00.000Z',
          updatedAt: '2026-09-03T10:00:00.000Z',
        },
      },
    })
    const { surface, onDrop } = target(['mesh'])

    fireEvent.drop(surface, { dataTransfer: desktopFile('chair.obj') })

    await waitFor(() => expect(onDrop).toHaveBeenCalledWith(model))
    expect(ingestPaths).toHaveBeenCalledWith('request-1', '', expect.any(String), undefined)
  })

  it('lets a drag whose names it cannot read through, rather than forbidding the drop', () => {
    const { surface } = target(PICTURES)
    const dataTransfer = protectedDesktopDrag()

    fireEvent.dragOver(surface, { dataTransfer })

    // `none` stops the browser sending `drop` at all, and the store is protected on EVERY real
    // dragover — set on a neutral tone, nothing dropped from the desktop ever imported.
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('hands the compatible part of a mixed desktop batch to the target', async () => {
    const model: Asset = { ...asset, id: 'asset_3', name: 'table', type: 'mesh' }
    const offer = vi.fn(async () => ({
      request: { id: 'request-2' },
      refused: [{ name: 'notes.txt', extension: 'txt' }],
    }))
    installFakeBridge({
      externalFiles: { offer },
      media: {
        ingestPaths: async () => ({
          assets: [model],
          documents: [],
          montages: [],
          refused: [],
          failed: [],
        }),
      },
    })
    const { surface, onDrop } = target(['mesh'])
    const transfer = desktopFiles(['table.obj', 'notes.txt'])

    fireEvent.dragOver(surface, { dataTransfer: transfer })
    expect(surface.className).toContain('outline-danger')
    expect(transfer.dropEffect).toBe('copy')
    fireEvent.drop(surface, { dataTransfer: transfer })

    await waitFor(() => expect(onDrop).toHaveBeenCalledWith(model))
    expect(offer).toHaveBeenCalledOnce()
  })
})

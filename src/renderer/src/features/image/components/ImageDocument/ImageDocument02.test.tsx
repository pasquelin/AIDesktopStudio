import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { ASSET_DRAG_TYPE, startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { useAssets } from '@/stores/assets'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { panelsStore } from '@/stores/panels'
import { chassisFor } from '@/stores/panels-fixtures'
import { ImageDocument } from './ImageDocument'

const setTool = vi.fn()
const setShape = vi.fn()
const setBrush = vi.fn()
const applyCrop = vi.fn()
const dropCrop = vi.fn()
const mergeInto = vi.fn()
const setLanguage = vi.fn()

// jsdom has no WebGL context: the engine is exercised by hand, not here. What this covers is
// that the document wires the bar to the right calls.
vi.mock('@/engines/canvas/CanvasEngine', () => {
  return {
    // The brush's own defaults are NOT doubled here: they live in `engines/canvas/brush`, which
    // holds no Pixi, so the real ones are used. A copy kept here could drift from them in
    // silence — and a double that no longer doubles is a test that lies.
    CanvasEngine: class {
      mount = vi.fn(() => Promise.resolve())
      apply = vi.fn()
      dispose = vi.fn()
      setView = vi.fn()
      setLanguage = setLanguage
      setTool = setTool
      setBrush = setBrush
      loadInto = vi.fn(() => Promise.resolve())
      setSelection = vi.fn()
      setEditingText = vi.fn()
      setSelectionShape = vi.fn()
      setShape = setShape
      snapshot = vi.fn(() => Promise.resolve('data:image/png;base64,AAAA'))
      applyCrop = applyCrop
      dropCrop = dropCrop
      mergeInto = mergeInto
      pixelSnapshots = vi.fn(() => Promise.resolve([]))
      restoreSnapshot = vi.fn(() => Promise.resolve())
    },
  }
})

const press = (key: string, shiftKey = false): void => {
  fireEvent.keyDown(window, { code: key, shiftKey })
}

const armed = (): void => {
  useDocuments.setState({ activeId: 'doc-1' })
  render(<ImageDocument documentId="doc-1" />)
}

const armedWith = (key: string, shift = false): void => {
  if (screen.queryAllByRole('button', { name: /^Pipette/ }).length === 0) armed()
  press(key, shift)
}

describe('ImageDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLayouts.setState({ activeWorkspace: 'image', home: false })
  })

  describe('the paint settings follow the armed tool', () => {
    const settingsUnder = async (key: string, shift = false): Promise<string[]> => {
      armedWith(key, shift)
      const flyout = screen.queryByRole('button', { name: 'Réglages du pinceau' })
      if (!flyout) return []

      await userEvent.click(flyout)
      await screen.findByLabelText('Taille')
      return ['Taille', 'Dureté', 'Opacité'].filter(name => screen.queryByLabelText(name) !== null)
    }

    it('offers hardness under the brush, the only tool that feathers', async () => {
      expect(await settingsUnder('KeyB')).toEqual(['Taille', 'Dureté', 'Opacité'])
    })

    it('takes hardness away under the pencil, which is hard by definition', async () => {
      expect(await settingsUnder('KeyB', true)).toEqual(['Taille', 'Opacité'])
    })

    it('takes hardness away under the eraser as well', async () => {
      expect(await settingsUnder('KeyE')).toEqual(['Taille', 'Opacité'])
    })

    it('takes hardness away under the shapes, whose size is a stroke width', async () => {
      expect(await settingsUnder('KeyU')).toEqual(['Taille', 'Opacité'])
    })

    /**
     * The colour belongs to the DOCUMENT, not to the tool: shown only under a painting tool, it
     * could not be chosen before picking a brush, and nothing said which colour the next stroke
     * would be. Every one of these tools is one the bar opens on or reaches for mid-work.
     */
    it.each([
      ['the eraser', 'KeyE'],
      ['the bucket', 'KeyG'],
      ['the eyedropper', 'KeyI'],
      ['the pointer', 'KeyV'],
    ])('keeps the colour under %s, whatever that tool reads', (_name, key) => {
      armedWith(key)

      expect(screen.getByLabelText('Couleur')).toBeInTheDocument()
    })

    // The bucket sets a colour and nothing else: a flyout of sliders it never reads would be
    // the same defect one control further along.
    it('offers the bucket no slider flyout at all', () => {
      armedWith('KeyG')

      expect(screen.queryByRole('button', { name: 'Réglages du pinceau' })).not.toBeInTheDocument()
    })

    it.each([
      ['the eyedropper', 'KeyI'],
      ['the pointer', 'KeyV'],
      ['the crop frame', 'KeyC'],
      ['the caption tool', 'KeyT'],
    ])('offers no setting at all under %s, which paints no pixel', (_name, key) => {
      armedWith(key)

      expect(screen.queryByRole('button', { name: 'Réglages du pinceau' })).not.toBeInTheDocument()
    })
  })

  describe('the bracket keys', () => {
    it('steps the size up and down through the registry, not by a listener of its own', () => {
      armedWith('KeyB')

      press('BracketRight')
      expect(setBrush).toHaveBeenLastCalledWith(expect.objectContaining({ size: 34 }))

      press('BracketLeft')
      expect(setBrush).toHaveBeenLastCalledWith(expect.objectContaining({ size: 24 }))
    })

    // The settings are not on screen under the pointer, so a bracket there moved a number nobody
    // could see — and the surprise arrived at the first stroke, long after the key.
    it('does nothing under a tool that shows no size', () => {
      armedWith('KeyV')
      setBrush.mockClear()

      press('BracketRight')

      expect(setBrush).not.toHaveBeenCalled()
    })

    it('leaves the colour alone while it resizes', () => {
      armed()

      press('BracketRight')
      expect(setBrush).toHaveBeenLastCalledWith(expect.objectContaining({ color: 0x000000 }))
    })
  })

  it('hands the chosen tool to the engine', async () => {
    render(<ImageDocument documentId="doc-1" />)
    await userEvent.click(screen.getByRole('button', { name: /^Pipette/ }))
    expect(setTool).toHaveBeenCalledWith('picker')
  })

  // The paint group, the eraser having become a single button when the mode behind its second
  // row turned out to arm the very same gesture.
  it('opens a group’s modes on hover', async () => {
    render(<ImageDocument documentId="doc-1" />)
    await userEvent.hover(screen.getByRole('button', { name: /^Pinceau/ }))
    // A regex, not the bare label: a row that carries a key wears it in its accessible name.
    expect(await screen.findByRole('menuitemradio', { name: /^Crayon/ })).toBeInTheDocument()
  })

  it('draws no history button of its own', () => {
    render(<ImageDocument documentId="doc-1" />)
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
  })

  describe('dropping a picture on it', () => {
    const picture: Asset = {
      id: 'asset-7',
      name: 'concept art',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-08-08T10:00:00.000Z',
    }

    /** A drop carrying our own MIME type, as the asset browser sends it. */
    function drop(target: Element): void {
      const transfer = dragTransfer()
      transfer.setData(ASSET_DRAG_TYPE, picture.id)
      fireEvent.drop(target, { dataTransfer: transfer })
    }

    it('lays the dropped asset down as a layer of its own', async () => {
      useAssets.setState({ items: [picture] })
      const { container } = render(<ImageDocument documentId="doc-1" />)

      const surface = container.querySelector('.relative.min-w-0')
      expect(surface).not.toBeNull()
      if (surface) drop(surface)

      await waitFor(() =>
        expect(canvasOf(useCanvases.getState(), 'doc-1').layers.at(-1)?.name).toBe('concept art'),
      )
    })

    /**
     * The surface takes the drag — `preventDefault` is what makes a drop possible at all — and
     * draws NO frame doing it.
     *
     * The frame was there and is gone: this surface fills the centre, so outlining it says
     * nothing the user cannot already see, and the pointer's own "+" says it better. It stays on
     * the surfaces where it IS the answer — a material's channel slots, a field — which is what
     * `AssetDropTarget.outlined` documents and `AssetDropTarget.test.tsx` holds.
     */
    it('takes our drag without drawing a frame over the middle of the window', () => {
      const { container } = render(<ImageDocument documentId="doc-1" />)
      const surface = container.querySelector('.relative.min-w-0')
      expect(surface).not.toBeNull()

      const dataTransfer = dragTransfer()
      startAssetDrag({ dataTransfer }, { id: 'asset-1', type: 'image' })
      const notPrevented = surface && fireEvent.dragOver(surface, { dataTransfer })

      expect(notPrevented).toBe(false)
      expect(container.querySelector('.outline-accent')).toBeNull()
    })

    // It used to light up for anything at all, which also meant it swallowed files dragged in
    // from the desktop — the drop then did nothing, silently. The light is gone; the swallowing
    // must stay gone with it, which is what the default NOT being prevented says.
    it('leaves a drag that is not one of ours to the platform', () => {
      const { container } = render(<ImageDocument documentId="doc-1" />)
      const surface = container.querySelector('.relative.min-w-0')

      const notPrevented = surface && fireEvent.dragOver(surface, { dataTransfer: dragTransfer() })

      expect(notPrevented).toBe(true)
    })
  })

  // Placing a picture arms no gesture: it is a choice, and the shelf is where one is made.
  it('brings the shelf forward instead of arming a tool that draws nothing', async () => {
    chassisFor('image', { left: { primary: 'assets' } })
    render(<ImageDocument documentId="doc-1" />)

    await userEvent.hover(screen.getByRole('button', { name: /^Rectangle/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /^Image/ }))

    expect(panelsStore.getState().focusedZone).toBe('left')
    expect(setTool).not.toHaveBeenCalledWith('shape')
  })
})

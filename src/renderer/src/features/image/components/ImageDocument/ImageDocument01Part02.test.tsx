import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BRUSH_SIZE } from '@/engines/canvas/brush'
import { useCanvasViews } from '@/stores/canvasViews'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
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

  describe('answering a crop frame', () => {
    it('greys both buttons while no frame is drawn', () => {
      useCanvasViews.getState().setCropFrame('doc-1', false)
      render(<ImageDocument documentId="doc-1" />)

      expect(screen.getByRole('button', { name: /^Appliquer le recadrage/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /^Abandonner le recadrage/ })).toBeDisabled()
    })

    it('crops to the frame the engine drew', async () => {
      useCanvasViews.getState().setCropFrame('doc-1', true)
      render(<ImageDocument documentId="doc-1" />)

      await userEvent.click(screen.getByRole('button', { name: /^Appliquer le recadrage/ }))

      expect(applyCrop).toHaveBeenCalled()
    })

    it('takes that frame away without cropping', async () => {
      useCanvasViews.getState().setCropFrame('doc-1', true)
      render(<ImageDocument documentId="doc-1" />)

      await userEvent.click(screen.getByRole('button', { name: /^Abandonner le recadrage/ }))

      expect(dropCrop).toHaveBeenCalled()
      expect(applyCrop).not.toHaveBeenCalled()
    })

    // It ACTS, so it has no pressed state: a button for ever announcing "toggle, not pressed"
    // describes something it does not have.
    it('announces neither of them as a toggle', () => {
      useCanvasViews.getState().setCropFrame('doc-1', true)
      render(<ImageDocument documentId="doc-1" />)

      expect(screen.getByRole('button', { name: /^Appliquer le recadrage/ })).not.toHaveAttribute(
        'aria-pressed',
      )
    })
  })

  /**
   * The brush shipped with a size, a hardness and an opacity that nothing on screen could reach:
   * every stroke was 24 px wide for the life of the session.
   */
  describe('the brush settings', () => {
    const openSettings = async (): Promise<void> => {
      armedWith('KeyB')
      await userEvent.click(screen.getByRole('button', { name: 'Réglages du pinceau' }))
    }

    it('offers all three behind the brush button', async () => {
      await openSettings()

      expect(await screen.findByLabelText('Taille')).toBeInTheDocument()
      expect(screen.getByLabelText('Dureté')).toBeInTheDocument()
      expect(screen.getByLabelText('Opacité')).toBeInTheDocument()
    })

    it('hands a new size straight to the engine', async () => {
      await openSettings()
      fireEvent.change(await screen.findByLabelText('Taille'), { target: { value: '96' } })

      expect(setBrush).toHaveBeenLastCalledWith(expect.objectContaining({ size: 96 }))
    })

    it('shows the size it is set to, so the next stroke is no longer a guess', async () => {
      await openSettings()

      expect(await screen.findByLabelText('Taille')).toHaveValue('24')
      expect(screen.getByLabelText('Taille')).toHaveAttribute('max', String(BRUSH_SIZE.max))
    })
  })

  /**
   * A control the armed tool ignores is gone, not greyed — the rule the inspector already applies
   * to a sprite, which gets no shadow section rather than a dead one. The hardness slider under
   * the pencil is the case that named it: live, draggable, and moving nothing.
   *
   * What each tool reads is `BRUSH_SETTINGS_BY_TOOL`, and the engine's `softness()` asks the same
   * table — so a row that shows here is a row that does something there.
   */
})

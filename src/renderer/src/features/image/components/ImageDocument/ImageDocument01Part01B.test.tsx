import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('arms the brush when its key is pressed', () => {
    armed()

    press('KeyB')

    expect(setTool).toHaveBeenLastCalledWith('brush')
  })

  it('arms the eyedropper, the bucket and the eraser by their own keys', () => {
    armed()

    press('KeyI')
    expect(setTool).toHaveBeenLastCalledWith('picker')

    press('KeyG')
    expect(setTool).toHaveBeenLastCalledWith('fill')

    press('KeyE')
    expect(setTool).toHaveBeenLastCalledWith('eraser')
  })

  // The bar has to follow the key: an armed tool the buttons disagree with is worse than none.
  it('moves the armed button with the key, not just the engine', () => {
    armed()

    press('KeyB')

    expect(screen.getByRole('button', { name: /^Pinceau/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Déplacement/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  /**
   * `L` was claimed by the lasso and by the line at once, which a registry makes impossible.
   * The lasso keeps it, as it does in every editor that has one; the line takes Shift and the
   * shape key `U`, since that is the group it belongs to.
   */
  it('gives L to the lasso and Shift+U to the line', () => {
    armed()

    press('KeyL')
    expect(setTool).toHaveBeenLastCalledWith('select')

    press('KeyU', true)
    expect(setTool).toHaveBeenLastCalledWith('shape')
    expect(setShape).toHaveBeenLastCalledWith('line')
  })

  // Read off the registry rather than written on the button, so a remapped key moves with it.
  it('wears the key the registry gives it', () => {
    render(<ImageDocument documentId="doc-1" />)

    expect(screen.getByRole('button', { name: 'Pinceau (B)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pipette (I)' })).toBeInTheDocument()
  })

  it('offers a colour input', () => {
    armedWith('KeyB')
    expect(screen.getByLabelText('Couleur')).toBeInTheDocument()
  })

  /**
   * ⏎ and ⎋ answered a crop frame and nothing else did — a key nothing on screen names. Greyed
   * rather than dropped while there is no frame, the rule the rest of this bar follows.
   */
})

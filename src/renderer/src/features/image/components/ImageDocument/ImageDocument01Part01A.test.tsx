import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PANE_TOOLBAR } from '@/components/styles'
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

describe('ImageDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLayouts.setState({ activeWorkspace: 'image', home: false })
  })

  /**
   * The rulers are graduated by the engine, which has no way to ask what language the window is
   * in — it is pushed, like the view. Left unpushed, the graduations keep the language they were
   * mounted in while the inspector beside them changes, and that is a defect this very lot
   * shipped once before the review caught it.
   */
  it('hands the engine the language its graduations are written in', () => {
    render(<ImageDocument documentId="doc-1" />)

    expect(setLanguage).toHaveBeenCalledWith('fr')
  })

  it('renders the shared toolbar with the image tools', () => {
    render(<ImageDocument documentId="doc-1" />)
    // A group wears its armed mode's name, so the pointer reads `Move` and the paint group
    // `Brush` — the bar says what the next click will do, not what the group is called.
    expect(screen.getByRole('button', { name: /^Déplacement/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Pinceau/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Rectangle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Texte/ })).toBeInTheDocument()
  })

  /**
   * The inset comes from the design system; only the ruler offset is this space's own, and it is
   * a runtime measure no class can express.
   */
  it('places its bar where every space places it, rulers aside', () => {
    render(<ImageDocument documentId="doc-1" />)
    expect(screen.getByRole('toolbar')).toHaveClass(PANE_TOOLBAR)
  })

  it('opens on the pointer, so the first click cannot write on the picture', () => {
    render(<ImageDocument documentId="doc-1" />)

    expect(screen.getByRole('button', { name: /^Déplacement/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Pinceau/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('offers every shape Figma does, behind the shapes group', async () => {
    render(<ImageDocument documentId="doc-1" />)
    await userEvent.hover(screen.getByRole('button', { name: /^Rectangle/ }))

    // The accessible name carries the shortcut, so `Line` reads `Line (L)`.
    for (const name of ['Trait', 'Flèche', 'Ellipse', 'Polygone', 'Étoile']) {
      expect(
        await screen.findByRole('menuitemradio', { name: new RegExp(`^${name}`) }),
      ).toBeVisible()
    }
  })

  it('arms the group with the mode chosen, and hands it to the engine', async () => {
    render(<ImageDocument documentId="doc-1" />)

    await userEvent.hover(screen.getByRole('button', { name: /^Déplacement/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /^Main/ }))

    expect(setTool).toHaveBeenLastCalledWith('hand')
    expect(screen.getByRole('button', { name: /^Main/ })).toBeInTheDocument()
  })
})

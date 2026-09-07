import { act, fireEvent, render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CANVAS, pixelLayer } from '@/engines/canvas/canvasState'
import { canUndo } from '@/engines/core/history'
import { installCanvas } from '@/stores/canvas-fixtures'
import { canvasHistoryOf, useCanvases } from '@/stores/canvases'
import { useDocuments } from '@/stores/documents'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
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

describe('merging the layer below', () => {
  const DOCUMENT = 'doc-merge'

  // Three flat layers, so `layerBelow` has an unambiguous answer for each of them.
  const select = (activeLayerId: string) =>
    installCanvas(DOCUMENT, {
      ...DEFAULT_CANVAS,
      layers: [pixelLayer('a', 'A'), pixelLayer('b', 'B'), pixelLayer('c', 'C')],
      activeLayerId,
    })

  // The sibling `describe` above owns the one on line 49, so this suite needs its own.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('composes the layer selected now, not the one selected when the space opened', () => {
    select('b')
    render(<ImageDocument documentId={DOCUMENT} />)

    act(() => select('c'))
    fireEvent.keyDown(window, { code: 'KeyE', metaKey: true })

    expect(mergeInto).toHaveBeenCalledWith('b', 'c')
  })

  it('offers nothing at the bottom of the stack', () => {
    select('a')
    render(<ImageDocument documentId={DOCUMENT} />)

    fireEvent.keyDown(window, { code: 'KeyE', metaKey: true })

    expect(mergeInto).not.toHaveBeenCalled()
    // The history too: `run` stacks a command whether or not it changed anything, so a merge that
    // let the command through at the bottom would leave a ⌘Z that undoes nothing.
    expect(canUndo(canvasHistoryOf(useCanvases.getState(), DOCUMENT))).toBe(false)
  })
})

/**
 * A shortcut runs outside React and has nowhere to report to: a dismissed dialog and a volume
 * that refused the write look exactly alike from the canvas, and only one of the two is worth
 * knowing about.
 */
describe('exporting the canvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'image',
          workspace: 'image',
          title: 'Poster',
          path: 'documents/Poster.ora',
        },
      },
      activeId: 'doc-1',
    })
  })

  it('records a write the disk refused', async () => {
    const watched = bridgeWatchingLogs({
      dialog: { exportPicture: () => Promise.reject(new Error('read-only volume')) },
    })
    render(<ImageDocument documentId="doc-1" />)

    await userEvent.keyboard('{Meta>}{Shift>}E{/Shift}{/Meta}')

    await waitFor(() =>
      expect(watched.report).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'image.export',
          message: expect.stringContaining('read-only volume'),
        }),
      ),
    )
  })
})

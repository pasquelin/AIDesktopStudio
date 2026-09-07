import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS, type CanvasState } from '@/engines/canvas/canvasState'
import { installCanvas } from '@/stores/canvas-fixtures'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { CanvasInspector } from './CanvasInspector'

const DOCUMENT = 'doc-1'

beforeEach(() => {
  installCanvas(DOCUMENT)
})

const stack = (): CanvasState => canvasOf(useCanvases.getState(), DOCUMENT)

function show(canvas: CanvasState = DEFAULT_CANVAS): void {
  render(<CanvasInspector documentId={DOCUMENT} canvas={canvas} />)
}

describe('CanvasInspector', () => {
  it('solves the cell from the wanted resolution, whatever the document measures', async () => {
    show({ ...DEFAULT_CANVAS, pixelCell: 1 })
    await userEvent.click(screen.getByRole('radio', { name: '64' }))

    expect(stack().pixelCell).toBe(16)
  })

  it('lands on one for a document already drawn at its own size', async () => {
    show({ ...DEFAULT_CANVAS, width: 64, height: 64, pixelCell: 8 })
    await userEvent.click(screen.getByRole('radio', { name: '64' }))

    expect(stack().pixelCell).toBe(1)
  })

  it('holds the grid off until it is asked for', async () => {
    show()

    expect(screen.queryByRole('radiogroup')).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: /mode pixel art/i }))
    expect(stack().pixelCell).toBe(1)
  })

  it('recuts the picture once the size field is left, never while it is typed in', async () => {
    show()
    const width = screen.getByRole('spinbutton', { name: /largeur/i })

    await userEvent.type(width, '640', { initialSelectionStart: 0, initialSelectionEnd: 4 })
    expect(stack().width).toBe(1024)

    await userEvent.tab()
    expect(stack().width).toBe(640)
  })

  it('writes the depth a select answers as the number the document keeps', async () => {
    show()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /profondeur/i }), '16')

    expect(stack().bitDepth).toBe(16)
  })

  it('opens the four fields nothing in the studio could edit before it', () => {
    show()

    expect(screen.getByRole('spinbutton', { name: /largeur/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /hauteur/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /densité/i })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
  })
})

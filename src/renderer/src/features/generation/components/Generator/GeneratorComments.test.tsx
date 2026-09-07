import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { addLayer } from '@/engines/canvas/commands'
import { DEFAULT_CANVAS, pixelLayer } from '@/engines/canvas/canvasState'
import { installCanvas } from '@/stores/canvas-fixtures'
import { useGenerationComments } from '@/stores/generationComments'
import { GeneratorComments } from './GeneratorComments'
import type { FieldDescriptor } from '@shared/domain/model'

const FIELDS: readonly FieldDescriptor[] = [
  { key: 'prompt', kind: 'longText', label: 'Prompt', promptSpark: true, required: true },
  { key: 'image', kind: 'image', label: 'Image', required: true },
]

beforeEach(() => {
  useGenerationComments.setState({ comments: {} })
  installCanvas(
    'image-1',
    addLayer(pixelLayer('car', 'Car')).apply({ ...DEFAULT_CANVAS, activeLayerId: 'layer-1' }),
  )
})

describe('generation image comments', () => {
  it('shows the note and the layer it will edit', () => {
    useGenerationComments.getState().add('image-1', {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Extract this car',
      layerId: 'car',
    })

    render(<GeneratorComments fields={FIELDS} />)

    expect(screen.getByText('Extract this car')).toBeInTheDocument()
    expect(screen.getByText(/Car/)).toBeInTheDocument()
  })

  it('lets the note be removed before generation', () => {
    useGenerationComments.getState().add('image-1', {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Extract this car',
    })
    render(<GeneratorComments fields={FIELDS} />)

    fireEvent.click(screen.getByRole('button', { name: /retirer le commentaire/i }))

    expect(screen.queryByText('Extract this car')).not.toBeInTheDocument()
  })
})

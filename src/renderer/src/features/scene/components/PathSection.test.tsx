import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PATH, type SmoothPath } from '@shared/domain/scene'
import { PathSection } from './PathSection'

function show(overrides: Partial<SmoothPath> = {}) {
  const onChange = vi.fn()
  render(<PathSection path={{ ...DEFAULT_PATH, ...overrides }} onChange={onChange} gesture={{}} />)

  return onChange
}

describe('the rail section', () => {
  // Its title read `inspector.path`, which the bundle declares a second time for the row that
  // says where a FILE lives — so the section of a rail was headed "Emplacement".
  it('is headed after the rail rather than after a file location', () => {
    show()

    expect(screen.getByText('Chemin')).toBeInTheDocument()
  })

  it('offers the two values that shape the curve', () => {
    show()

    expect(screen.getByLabelText('Tension')).toBeInTheDocument()
    expect(screen.getByLabelText('Fermé')).toBeInTheDocument()
  })

  /**
   * The panel has no stretch of line to aim at — that gesture is ⌥ in the viewport — so its one
   * button can only work at the end. Posing the point after the LAST one folded back to the
   * first, which laid it in the middle of the line and sent the rail back the way it came.
   */
  it('extends the rail past its last point', async () => {
    const onChange = show()

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un point au chemin' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [...DEFAULT_PATH.points, { x: 0, y: 0, z: -7.5 }],
      }),
    )
  })
})

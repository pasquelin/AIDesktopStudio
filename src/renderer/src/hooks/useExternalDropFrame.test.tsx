import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useExternalDropFrame } from './useExternalDropFrame'

function DropFrame() {
  const frame = useExternalDropFrame(() => 'accepted')
  return (
    <div data-testid="frame" {...frame}>
      <button onDrop={event => event.stopPropagation()}>target</button>
    </div>
  )
}

describe('external drop frame', () => {
  it('clears its outline before a nested target consumes the drop', () => {
    render(<DropFrame />)
    const frame = screen.getByTestId('frame')

    fireEvent.dragOver(frame)
    expect(frame.className).toContain('outline-accent')

    fireEvent.drop(screen.getByRole('button'))
    expect(frame.className).not.toContain('outline-accent')
  })
})

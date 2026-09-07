import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tag } from './Tag'

describe('Tag', () => {
  /**
   * The docks speak the studio's tokens and the windows speak DaisyUI's. A dock tag that
   * reached for `badge` would look like an application chip inside a panel.
   */
  it('wears the dock vocabulary, not the windows', () => {
    render(<Tag>Keyboard · Space</Tag>)

    expect(screen.getByText('Keyboard · Space')).toHaveClass('bg-surface')
    expect(screen.getByText('Keyboard · Space')).not.toHaveClass('badge')
  })
})

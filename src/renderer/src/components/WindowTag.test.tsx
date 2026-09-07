import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowTag } from './WindowTag'

describe('WindowTag', () => {
  /**
   * The windows speak DaisyUI's tokens and the docks speak the studio's. A window tag that
   * reached for `Tag` would look like a panel label inside an ordinary window.
   */
  it('wears the window vocabulary, not the docks', () => {
    render(<WindowTag>At project</WindowTag>)

    expect(screen.getByText('At project')).toHaveClass('badge', 'badge-sm')
    expect(screen.getByText('At project')).not.toHaveClass('bg-surface', 'badge-success')
  })
})

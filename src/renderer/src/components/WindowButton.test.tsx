import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowButton } from './WindowButton'

describe('WindowButton', () => {
  it('keeps the former window role and size classes', () => {
    render(<WindowButton variant="danger">Remove</WindowButton>)
    expect(screen.getByRole('button')).toHaveClass('btn', 'btn-sm', 'btn-error', 'btn-outline')
  })

  it('defaults to a non-submitting button and lets dialogs keep their larger gauge', () => {
    render(<WindowButton size="dialog">Download</WindowButton>)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'button')
    expect(button).not.toHaveClass('btn-sm')
  })
})

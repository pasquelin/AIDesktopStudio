import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { stylesheet } from '../indexCss-fixtures'
import { TooltipHost } from './TooltipHost'

function Anchored() {
  return (
    <>
      <span role="img" tabIndex={0} {...TIP_BOTTOM('Something to explain')} />
      <TooltipHost />
    </>
  )
}

/**
 * Read the anchor rather than the bubble: the content node is in the document long before the
 * delay elapses, so its presence says nothing about whether the tooltip is open. The library
 * points `aria-describedby` at the tooltip for exactly as long as it shows.
 */
describe('TooltipHost', () => {
  it('opens on focus, so a tooltip is not a pointer-only channel', async () => {
    render(<Anchored />)

    await userEvent.tab()

    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('aria-describedby'))
  })

  // WCAG SC 1.4.13: at 400% zoom the bubble has to be swept to be read, so leaving the anchor
  // for it must not dismiss it.
  it('stays open once the pointer reaches the bubble', async () => {
    render(<Anchored />)
    const anchor = screen.getByRole('img')

    await userEvent.hover(anchor)
    await waitFor(() => expect(anchor).toHaveAttribute('aria-describedby'))
    await userEvent.hover(screen.getByRole('tooltip'))

    // Outlasting the library's 100 ms hide is the whole assertion: nothing else says it stayed.
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(anchor).toHaveAttribute('aria-describedby')
  })

  it('closes once the pointer leaves the bubble too', async () => {
    render(<Anchored />)
    const anchor = screen.getByRole('img')
    await userEvent.hover(anchor)
    await waitFor(() => expect(anchor).toHaveAttribute('aria-describedby'))
    const bubble = screen.getByRole('tooltip')
    await userEvent.hover(bubble)

    await userEvent.unhover(bubble)

    await waitFor(() => expect(anchor).not.toHaveAttribute('aria-describedby'))
  })

  // jsdom computes no transition, so the sheet is what says it. The CLOSING delay alone: the
  // opening fade is what keeps a bubble from snapping in after its second of wait.
  it('fades in and leaves at once', () => {
    expect(stylesheet).toContain('--rt-transition-closing-delay: 0s')
    expect(stylesheet).not.toContain('--rt-transition-show-delay: 0s')
  })

  // Where a tooltip is the only thing that shows a sentence, it is content rather than
  // decoration — and content has to go away without the pointer having to move.
  it('closes on Escape, without asking the focus to go anywhere', async () => {
    render(<Anchored />)
    const anchor = screen.getByRole('img')
    await userEvent.tab()
    await waitFor(() => expect(anchor).toHaveAttribute('aria-describedby'))

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(anchor).not.toHaveAttribute('aria-describedby'))
    expect(anchor).toHaveFocus()
  })
})

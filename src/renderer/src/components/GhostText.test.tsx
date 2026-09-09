import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { GhostText } from './GhostText'

const paint = (tail: string) =>
  render(
    <GhostText
      typed="genere une im"
      tail={tail}
      metrics="px-1 text-xs"
      ref={createRef<HTMLDivElement>()}
    />,
  )

// The colour is the HOST's now: a tail can be a whole sentence offered in place of the writing,
// with a key printed at its end, and only the field that offers it knows which.
describe('the mirror behind a field one writes in', () => {
  /**
   * 🛑 The written half is PAINTED and hidden, never dropped: without it the tail starts at the
   * left edge instead of under the caret, and the two read as one wrong sentence.
   */
  it('holds the written half invisible, wears its host’s type, and says none of it to a reader', () => {
    const { container } = paint('age')

    expect(container).toHaveTextContent('genere une image')
    expect(screen.getByText('genere une im')).toHaveClass('invisible')
    expect(container.firstElementChild).toHaveClass('px-1', 'text-xs')
    // The field beneath is what a reader hears; this layer would say the sentence twice.
    expect(container.firstElementChild).toHaveAttribute('aria-hidden')
  })

  // Mounted even with nothing to add: a mirror torn down between two tails loses the ref its
  // host scrolls it by, and comes back at the top of a field that is not.
  it('paints the writing alone when nothing completes it', () => {
    const { container } = paint('')

    expect(container).toHaveTextContent('genere une im')
  })
})

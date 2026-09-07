import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeBridge } from '@/services/fakeBridge'
import { ActivityListSaid } from './ActivityListSaid'

beforeEach(() => installFakeBridge({}))

describe('what a round trip carried', () => {
  /**
   * 🛑 The whole point: the journal line says « 90 711 caractères » and nothing else, because it
   * lives in a database the project carries. The text is asked for, and read here.
   */
  it('unfolds the whole text on demand, and asks for it once', async () => {
    const said = vi.fn(() => Promise.resolve('You drive AI Desktop Studio'))
    installFakeBridge({ assistant: { said } })
    render(<ActivityListSaid said="r:7" />)

    await userEvent.click(screen.getByRole('button', { name: /envoyé/ }))
    expect(await screen.findByText('You drive AI Desktop Studio')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /envoyé/ }))
    await userEvent.click(screen.getByRole('button', { name: /envoyé/ }))
    expect(said).toHaveBeenCalledTimes(1)
    expect(said).toHaveBeenCalledWith('r:7')
  })

  /** Unfolded whole: a scroller inside the journal's own scroller traps the wheel. */
  it('unfolds without a scroller of its own', async () => {
    installFakeBridge({ assistant: { said: () => Promise.resolve('You drive AI Desktop Studio') } })
    render(<ActivityListSaid said="r:7" />)

    await userEvent.click(screen.getByRole('button', { name: /envoyé/ }))

    const pane = await screen.findByText('You drive AI Desktop Studio')
    expect(pane.className).not.toMatch(/max-h-|overflow-/)
  })

  /** A line older than the ring is not a round trip that carried nothing — it says which. */
  it('says the text is gone rather than showing an empty pane', async () => {
    installFakeBridge({ assistant: { said: () => Promise.resolve(null) } })
    render(<ActivityListSaid said="r:1" />)

    await userEvent.click(screen.getByRole('button', { name: /envoyé/ }))

    expect(await screen.findByText(/plus gardé/)).toBeInTheDocument()
  })
})

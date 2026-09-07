import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { withQueries } from '@/features/shell/components/query-fixtures'
import type { Page } from './page'
import { usePages } from './usePages'

type Row = { id: string }

function Listing({
  read,
  enabled,
  endsOnRepeats,
}: {
  read: (from: { cursor?: string }) => Promise<Page<Row>> | undefined
  enabled?: boolean
  endsOnRepeats?: boolean
}) {
  const { items, exhausted, pending, more } = usePages(['listing'], read, {
    enabled,
    endsOnRepeats,
  })

  return (
    <>
      <span data-testid="ids">{items.map(item => item.id).join(',')}</span>
      <span data-testid="state">{pending ? 'pending' : exhausted ? 'exhausted' : 'open'}</span>
      <button type="button" onClick={more}>
        more
      </button>
    </>
  )
}

const idsOf = (): string => screen.getByTestId('ids').textContent ?? ''

describe('a listing read page by page', () => {
  it('appends the next page to the ones already read', async () => {
    const read = ({ cursor }: { cursor?: string }) =>
      Promise.resolve(
        cursor
          ? { items: [{ id: 'c' }], cursor: null }
          : { items: [{ id: 'a' }, { id: 'b' }], cursor: 'o:2' },
      )

    render(withQueries(<Listing read={read} />))
    await screen.findByText('a,b')

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('a,b,c')).toBeInTheDocument()
  })

  /**
   * These listings page by offset over something that keeps growing: an item created between two
   * requests shifts everything down one, and the row at the boundary comes back.
   */
  it('shows an item once, however many pages repeat it', async () => {
    const read = ({ cursor }: { cursor?: string }) =>
      Promise.resolve(
        cursor
          ? { items: [{ id: 'b' }, { id: 'c' }], cursor: null }
          : { items: [{ id: 'a' }, { id: 'b' }], cursor: 'o:2' },
      )

    render(withQueries(<Listing read={read} />))
    await screen.findByText('a,b')

    await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('a,b,c')).toBeInTheDocument()
  })

  /**
   * The offset stops advancing at its ceiling and the API answers the same page for ever. Read as
   * « there is more », that is an unbounded loop of identical searches, each one billed.
   */
  it('is at its end when the cursor stops advancing', async () => {
    const read = vi.fn(() => Promise.resolve({ items: [{ id: 'a' }], cursor: 'o:10000' }))

    render(withQueries(<Listing read={read} />))
    await screen.findByText('a')
    await userEvent.click(screen.getByRole('button'))
    await screen.findByText('exhausted')

    // The first page, then the one that came back on the same cursor. Never a third.
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('is at its end after a run of pages bringing nothing new', async () => {
    let offset = 0
    const read = vi.fn(() => {
      offset += 1
      return Promise.resolve({ items: [{ id: 'a' }], cursor: `o:${offset}` })
    })

    render(withQueries(<Listing read={read} />))
    await screen.findByText('a')
    for (let click = 0; click < 5; click += 1) await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('exhausted')).toBeInTheDocument()
    expect(read.mock.calls.length).toBeLessThanOrEqual(5)
  })

  /**
   * A walk that lists one set then another — the private models, then the public ones — repeats
   * itself legitimately, and a run of pages it has already shown is not the end of the catalogue.
   */
  it('walks on through a run of repeats when the caller says its walk repeats', async () => {
    let offset = 0
    const read = vi.fn(() => {
      offset += 1
      return Promise.resolve({
        items: offset > 4 ? [{ id: 'b' }] : [{ id: 'a' }],
        cursor: `o:${offset}`,
      })
    })

    render(withQueries(<Listing read={read} endsOnRepeats={false} />))
    await screen.findByText('a')
    for (let click = 0; click < 5; click += 1) await userEvent.click(screen.getByRole('button'))

    expect(await screen.findByText('a,b')).toBeInTheDocument()
  })

  it('is at its end as soon as a page comes back without a cursor', async () => {
    render(
      withQueries(<Listing read={() => Promise.resolve({ items: [{ id: 'a' }], cursor: null })} />),
    )

    expect(await screen.findByText('exhausted')).toBeInTheDocument()
  })

  // Neither « empty » nor « finished »: a shelf that told them apart would say a project holds
  // nothing while the first page is still on its way.
  it('says it is still waiting on its first page', () => {
    render(withQueries(<Listing read={() => new Promise(() => {})} />))

    expect(screen.getByTestId('state')).toHaveTextContent('pending')
  })

  it('reads nothing at all while it is not enabled', () => {
    const read = vi.fn(() => Promise.resolve({ items: [], cursor: null }))

    render(withQueries(<Listing read={read} enabled={false} />))

    expect(read).not.toHaveBeenCalled()
    expect(idsOf()).toBe('')
  })

  // A surface waiting on this one waited for the whole session: react-query calls a disabled
  // query pending, and the asset shelf read that as « the library is still answering ».
  it('is not waiting on a page it is not allowed to ask for', () => {
    render(withQueries(<Listing read={() => new Promise(() => {})} enabled={false} />))

    expect(screen.getByTestId('state')).toHaveTextContent('exhausted')
  })

  // No bridge is an answer: there is nothing to ask, and nothing more to wait for.
  it('settles when the caller has nothing to ask', async () => {
    render(withQueries(<Listing read={() => undefined} />))

    expect(await screen.findByText('exhausted')).toBeInTheDocument()
  })
})

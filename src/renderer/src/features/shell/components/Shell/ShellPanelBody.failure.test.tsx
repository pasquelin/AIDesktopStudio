import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellPanelActions } from './ShellPanelActions'
import { ShellPanelBody } from './ShellPanelBody'

// A tool that cannot render, which no real one does on demand. Its own file because `vi.mock`
// is hoisted over the whole module, and the other tests need the real registry. The factory is
// async so it can reach `lazy` — hoisting puts it above every import.
vi.mock('../toolComponents', async () => {
  const { lazy } = await import('react')

  const panels: Record<string, unknown> = {
    assets: {
      Content: () => {
        throw new Error('tool exploded')
      },
    },
    // Renders its content fine, but its header actions do not.
    layers: {
      Content: () => <p>layer list</p>,
      Actions: () => {
        throw new Error('actions exploded')
      },
    },
    explorer: {
      Content: () => <p>explorer tree</p>,
      Actions: () => <p>explorer actions</p>,
    },
    // Every panel is fetched on demand, so a chunk that never lands is a failure mode every one
    // of them has — and one React reports by throwing, not by suspending forever.
    scene: { Content: lazy(() => Promise.reject(new Error('chunk never landed'))) },
  }

  return {
    isKnownTool: (id: string) => id in panels,
    toolDefinition: (id: string) => panels[id],
    hasActions: (id: string) => 'Actions' in ((panels[id] ?? {}) as object),
  }
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a panel whose tool throws', () => {
  it('draws the failure in the body, leaving the frame to close it', () => {
    render(<ShellPanelBody tool="assets" />)

    expect(screen.getByText('Ce panneau a rencontré une erreur.')).toBeInTheDocument()
  })

  it('does not take the rest of the window with it', () => {
    render(
      <div>
        <ShellPanelBody tool="assets" />
        <p>the rest of the studio</p>
      </div>,
    )

    expect(screen.getByText('the rest of the studio')).toBeInTheDocument()
  })
})

describe('a half switched to another tool', () => {
  it('does not hand the failure of the last tool to the next one', () => {
    const { rerender } = render(<ShellPanelBody tool="assets" />)
    expect(screen.getByText('Ce panneau a rencontré une erreur.')).toBeInTheDocument()

    // What the rail does: same element, another tool. The boundary must not survive it.
    rerender(<ShellPanelBody tool="layers" />)

    expect(screen.getByText('layer list')).toBeInTheDocument()
    expect(screen.queryByText('Ce panneau a rencontré une erreur.')).not.toBeInTheDocument()
  })

  it('gives the next tool its actions back, even if the last one lost them', () => {
    const { rerender } = render(<ShellPanelActions tool="layers" />)
    expect(screen.queryByText('explorer actions')).not.toBeInTheDocument()

    rerender(<ShellPanelActions tool="explorer" />)

    expect(screen.getByText('explorer actions')).toBeInTheDocument()
  })
})

describe('a panel whose chunk never arrives', () => {
  it('says so rather than suspending for ever', async () => {
    render(<ShellPanelBody tool="scene" />)

    expect(await screen.findByText('Ce panneau a rencontré une erreur.')).toBeInTheDocument()
  })
})

describe('a panel whose header actions throw', () => {
  it('drops the actions and keeps the content', () => {
    render(
      <>
        <ShellPanelActions tool="layers" />
        <ShellPanelBody tool="layers" />
      </>,
    )

    expect(screen.getByText('layer list')).toBeInTheDocument()
    // The content is fine, so the panel must not claim otherwise.
    expect(screen.queryByText('Ce panneau a rencontré une erreur.')).not.toBeInTheDocument()
  })
})

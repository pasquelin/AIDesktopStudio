import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewDocumentAsk } from '@shared/domain/newDocument'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { RailNewButton } from './RailNewButton'

const openDocument = vi.fn()
vi.mock('./dockviewApi', () => ({ openDocument: (...args: unknown[]) => openDocument(...args) }))

/**
 * The button pinned above the left rail's icons. It kept its only coverage inside the rail's own
 * suite until the chassis moved into `@pasquelin/panels` and took that suite with it — the rail
 * was never what these cases were about.
 */
describe('RailNewButton', () => {
  /** What the window was handed, which is the whole of what this button decides. */
  const asks: NewDocumentAsk[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    asks.length = 0
    installFakeBridge()
    useDocuments.setState({ documents: {} })
    useLayouts.setState({ activeWorkspace: '3d', home: false, layout: null })
    const stamp = '2026-08-07T10:00:00.000Z'
    useProject.setState({
      project: {
        path: '/projects/one',
        manifest: { version: 1, createdAt: stamp, updatedAt: stamp },
      },
    })
  })

  /** Answers as a person in front of the window would: the default bridge cancels. */
  const answering = (): void => {
    installFakeBridge({
      newDocument: {
        ask: ask => {
          asks.push(ask)
          return Promise.resolve({
            answer: 'made',
            place: { kind: 'scene', title: 'Niveau', folder: 'documents' },
          })
        },
      },
    })
  }

  it('creates what the window answers, and opens it', async () => {
    answering()
    render(<RailNewButton />)
    await userEvent.click(screen.getByRole('button', { name: 'Nouveau document' }))

    // The document is written before it is announced, so the tab arrives a turn later.
    await waitFor(() => expect(Object.keys(useDocuments.getState().documents)).toHaveLength(1))

    const documents = Object.values(useDocuments.getState().documents)
    expect(documents[0]?.workspace).toBe('3d')
    // A scene lays its template's files down before its tab arrives — see `seedTemplateFiles`.
    await waitFor(() => expect(openDocument).toHaveBeenCalledWith(documents[0]))
  })

  /**
   * It used to make two different things — a project on the home, a document elsewhere — so the
   * gesture meant one thing on one screen and another on the next. It opens the one window that
   * offers both now, and only the ORDER of what it offers follows the surface.
   */
  it('opens the same window from every surface, ordered by the one it was pressed on', async () => {
    answering()
    useLayouts.setState({ home: true })
    render(<RailNewButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Nouveau document' }))

    await waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]).toMatchObject({ kind: null, surface: 'home' })
  })

  /**
   * Never dead, which it was: a document needs a project, but a PROJECT does not — and the window
   * is where one is made. A button that refuses the only gesture that could unblock the studio is
   * the dead end this lot removes.
   */
  it('stays clickable with no project open', async () => {
    answering()
    useProject.setState({ project: null })
    render(<RailNewButton />)

    const button = screen.getByRole('button', { name: 'Nouveau document' })
    expect(button).not.toBeDisabled()

    await userEvent.click(button)
    await waitFor(() => expect(asks).toHaveLength(1))
    expect(asks[0]?.projectName).toBeNull()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IDockviewPanelHeaderProps } from 'dockview-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { workspaceById } from '@/helpers/workspaces'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import theme from '../../dockview-theme.css?raw'
import { DocumentTab } from './DocumentTab'

const closeDocument = vi.fn((_id: string) => Promise.resolve(true))
const deleteDocument = vi.fn((_id: string) => Promise.resolve(true))
const openPanelIds = vi.fn(() => ['doc-1', 'doc-2'])
const closeFileView = vi.fn((_id: string) => Promise.resolve(true))
const markedModified = vi.hoisted(() => ({ ids: new Set<string>() }))

vi.mock('../../../documentIo', () => ({
  closeDocument: (id: string) => closeDocument(id),
  deleteDocument: (id: string) => deleteDocument(id),
}))

vi.mock('../../dockviewApi', async importActual => ({
  ...(await importActual<Record<string, unknown>>()),
  openPanelIds: () => openPanelIds(),
  closeFileView: (id: string) => closeFileView(id),
}))

vi.mock('@/hooks/useDocumentModified', () => ({
  useDocumentModified: (id: string) => markedModified.ids.has(id),
}))

/** Only what the tab reads: its id, and the title Dockview restored. */
const props = (id: string, title?: string): IDockviewPanelHeaderProps =>
  ({ api: { id, title } }) as unknown as IDockviewPanelHeaderProps

let menu = fakeMenu()

const tabChrome = (): HTMLElement => {
  const parent = screen.getByRole('button', { name: 'Fermer l’onglet' }).parentElement
  if (!parent) throw new Error('expected the tab chrome around the close button')
  return parent
}

const rightClick = async (): Promise<void> => {
  await userEvent.pointer({ keys: '[MouseRight]', target: tabChrome() })
}

beforeEach(() => {
  vi.clearAllMocks()
  markedModified.ids.clear()
  useDocuments.setState({ documents: {}, activeId: null, recent: {} })
  menu = fakeMenu()
  installFakeBridge({ menu: menu.bridge })
})

describe('a document tab', () => {
  /**
   * One tab strip now holds six sections, where the title alone says nothing about which editor
   * a tab opens. Held against the rail's own table rather than against a glyph named here: a
   * `.gltf` wearing two different pictures in two lists is two vocabularies.
   */
  it('wears the glyph of its section, and names it', () => {
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'scene',
          title: 'Niveau',
          workspace: '3d',
          path: 'documents/Niveau.gltf',
        },
      },
    })

    const { container } = render(<DocumentTab {...props('doc-1')} />)

    const glyph = container.querySelector('[data-tooltip-content="Modélisation"] path')
    expect(glyph?.getAttribute('d')).toBe(workspaceById('3d').icon)
  })

  // A panel Dockview restored before the folder listing came back: its descriptor is not in yet,
  // and a glyph guessed from nothing would be a section the tab does not belong to.
  it('draws no glyph for a document the window has not heard of', () => {
    const { container } = render(<DocumentTab {...props('doc-1')} />)

    // The cross, and nothing in front of the title.
    expect(container.querySelectorAll('path')).toHaveLength(1)
  })

  it('keeps the title Dockview restored until the descriptor arrives', () => {
    render(<DocumentTab {...props('doc-1', 'Niveau')} />)
    expect(screen.getByText('Niveau')).toBeTruthy()
  })

  it('closes through the studio, so unsaved work is asked about', async () => {
    render(<DocumentTab {...props('doc-1')} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fermer l’onglet' }))
    expect(closeDocument).toHaveBeenCalledWith('doc-1')
  })

  // Dockview reads a click anywhere on a tab as "activate me"; the cross is not that.
  it('does not let the close click reach the tab underneath', async () => {
    const activate = vi.fn()
    render(
      <div onClick={activate}>
        <DocumentTab {...props('doc-1')} />
      </div>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fermer l’onglet' }))
    expect(closeDocument).toHaveBeenCalledWith('doc-1')
    expect(activate).not.toHaveBeenCalled()
  })

  it('opens its menu on a right-click', async () => {
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() =>
      expect(menu.labels()).toEqual([
        'Renommer',
        'Fermer l’onglet',
        'Fermer les autres onglets',
        'Supprimer le document…',
      ]),
    )
  })

  /**
   * The tab is where a document's name is read most, so it is where renaming has to be reachable
   * — and the field takes the whole tab while it is open: Dockview's own tab carries the drag,
   * and leaving it mounted underneath would have a rename begin one on the first pointer move.
   */
  it('renames the document in place, from the menu', async () => {
    const document: DocumentDescriptor = {
      id: 'doc-1',
      kind: 'scene',
      title: 'Niveau',
      workspace: '3d',
      path: 'documents/Niveau.gltf',
    }
    useDocuments.setState({ documents: { 'doc-1': document }, stored: [document] })

    const rename = vi.fn(() => Promise.resolve({ ...document, title: 'Décor' }))
    installFakeBridge({ documents: { rename }, menu: menu.bridge })
    menu.picks('Renommer')
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()
    const field = await screen.findByRole('textbox', { name: 'Nom du document' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Décor{Enter}')

    await vi.waitFor(() => expect(rename).toHaveBeenCalledWith('doc-1', 'scene', 'Décor'))
  })

  it('offers to delete the document, which nothing else in the studio does', async () => {
    menu.picks('Supprimer le document…')
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('doc-1'))
  })

  // A cancel means "no to closing", not "no to this one tab".
  it('stops closing the others as soon as one is cancelled', async () => {
    openPanelIds.mockReturnValue(['doc-1', 'doc-2', 'doc-3'])
    closeDocument.mockResolvedValue(false)
    menu.picks('Fermer les autres onglets')
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() => expect(closeDocument).toHaveBeenCalledWith('doc-2'))
    expect(closeDocument).toHaveBeenCalledTimes(1)
  })

  // The fourth closing gesture, and the one that reaches a file view without ever showing its
  // tab: `closeDocument` on one asks nothing, drops the edits, and answers `true` to the run.
  it('sends a file view among the others to its own closer', async () => {
    openPanelIds.mockReturnValue(['doc-1', 'file:Entrées/Clavier.input.json'])
    closeDocument.mockResolvedValue(true)
    menu.picks('Fermer les autres onglets')
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() =>
      expect(closeFileView).toHaveBeenCalledWith('file:Entrées/Clavier.input.json'),
    )
    expect(closeDocument).not.toHaveBeenCalled()
  })

  it('never closes the tab the menu was opened on', async () => {
    openPanelIds.mockReturnValue(['doc-1', 'doc-2', 'doc-3'])
    closeDocument.mockResolvedValue(true)
    menu.picks('Fermer les autres onglets')
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() => expect(closeDocument.mock.calls.flat()).toEqual(['doc-2', 'doc-3']))
  })

  it('greys out closing the others when there are none', async () => {
    openPanelIds.mockReturnValue(['doc-1'])
    render(<DocumentTab {...props('doc-1')} />)

    await rightClick()

    await vi.waitFor(() => expect(menu.offers('Fermer les autres onglets')).toBe(false))
  })

  /**
   * The cross sits beside the title, never under it. jsdom lays nothing out, so what is checked
   * is the rule that puts it there — the same approach as the colour tokens.
   *
   * The rule has to name **`.dv-react-part`**, and an earlier one that named `.dv-tab` alone did
   * not work: dockview-react mounts a custom tab inside a `dv-react-part` div it builds in JS,
   * which its own stylesheet never mentions — so it stays a block, and the title (`width: 100%`)
   * and our close button stack inside it. A row laid on `.dv-tab` places that single div and
   * nothing else. Measured on the running app before and after.
   */
  describe('the close button beside the title', () => {
    const ruleFor = (selector: string): string => {
      const at = theme.indexOf(`${selector} {`)
      return at < 0 ? '' : theme.slice(at, theme.indexOf('}', at))
    }

    // Without this the rule below reads an empty string and passes on nothing: the renderer
    // project stubs stylesheets, and `vitest.config.ts` has to spare each `?raw` read by name.
    it('reads the theme at all', () => {
      expect(theme).toContain('.dv-dockview')
    })

    it('lays the row on the div react is mounted in, not on the tab above it', () => {
      expect(ruleFor('.dv-dockview .dv-tab > .dv-react-part')).toMatch(/display:\s*flex/)
      expect(ruleFor('.dv-dockview .dv-tab > .dv-react-part')).toMatch(/align-items:\s*center/)
    })

    it('lets the title shrink inside that row rather than push the cross out', () => {
      expect(ruleFor('.dv-dockview .dv-tab > .dv-react-part')).toMatch(/min-width:\s*0/)
    })

    it('never shrinks away when the title is long', () => {
      render(<DocumentTab {...props('doc-1')} />)

      expect(screen.getByRole('button', { name: 'Fermer l’onglet' }).className).toContain(
        'shrink-0',
      )
    })
  })

  it('marks unsaved work with an asterisk and a bold title', () => {
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'scene',
          title: 'Niveau',
          workspace: '3d',
          path: 'documents/Niveau.gltf',
        },
      },
    })
    markedModified.ids.add('doc-1')

    render(<DocumentTab {...props('doc-1')} />)

    expect(screen.getByText('Niveau').className).toContain('font-semibold')
    expect(screen.getByText('*').className).toContain('text-accent-ink')
  })

  it('leaves a saved document unmarked', () => {
    useDocuments.setState({
      documents: {
        'doc-1': {
          id: 'doc-1',
          kind: 'scene',
          title: 'Niveau',
          workspace: '3d',
          path: 'documents/Niveau.gltf',
        },
      },
    })

    render(<DocumentTab {...props('doc-1')} />)

    expect(screen.getByText('Niveau').className).not.toContain('font-semibold')
    expect(screen.queryByText('*')).toBeNull()
  })
})

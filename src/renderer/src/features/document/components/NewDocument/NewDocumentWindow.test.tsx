import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { NewDocumentAnswer, NewDocumentAsk } from '@shared/domain/newDocument'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { NewDocumentWindow } from './NewDocumentWindow'

const ASK: NewDocumentAsk = {
  kind: 'scene',
  surface: '3d',
  picked: 'documents',
  projectName: 'One',
  recentProjects: [],
  open: [],
}

/** What a filled form answers with — the place, under the word that says a document was made. */
const made = (place: Record<string, unknown>): NewDocumentAnswer =>
  ({ answer: 'made', place }) as NewDocumentAnswer

const stored = (fileName: string): DocumentDescriptor => ({
  id: fileName,
  kind: 'scene',
  workspace: '3d',
  title: fileName.replace(/\.gltf$/, ''),
  path: `documents/${fileName}`,
})

const answer = vi.fn<(given: NewDocumentAnswer | null) => Promise<void>>()

function open(ask: NewDocumentAsk | null, onDisk: DocumentDescriptor[] = []): void {
  installFakeBridge({
    newDocument: { request: () => Promise.resolve(ask), answer: given => answer(given) },
    documents: { list: () => Promise.resolve(onDisk) },
    // Where a role's folder actually is — asked, never composed, since only the main process
    // reads the markers a rename in the Finder leaves behind.
    project: { folderFor: (role: string) => Promise.resolve(`Dossiers/${role}`) },
  })
}

describe('NewDocumentWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    answer.mockResolvedValue(undefined)
    useDocuments.setState({ documents: {}, stored: [] })
  })

  it('uses the existing project shelf to choose where outside files are imported', async () => {
    open({
      ...ASK,
      purpose: 'externalFiles',
      recentProjects: [
        {
          path: '/projects/one',
          openedAt: '2026-09-03T10:00:00.000Z',
          createdAt: '2026-09-03T10:00:00.000Z',
        },
      ],
    })
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'one' }))

    expect(answer).toHaveBeenCalledWith({ answer: 'recentProject', path: '/projects/one' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('opens on the suggested name, selected, with its extension beside it', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    const field = await screen.findByRole('textbox')
    expect(field).toHaveValue('Scène 1')
    // Awaited: the field is focused by an effect, which React runs AFTER the commit that puts it
    // in the DOM — so the query that finds it can win the race, and did on a loaded machine.
    await waitFor(() => expect(field).toHaveFocus())
    // SELECTED, and nothing else in the suite says so: the whole name is there to be replaced,
    // and `select()` could be deleted with every case still green.
    expect(field).toHaveProperty('selectionStart', 0)
    expect(field).toHaveProperty('selectionEnd', 'Scène 1'.length)
    expect(screen.getByText('.gltf')).toBeInTheDocument()
  })

  it('answers with the name, the folder and the template a scene opens on', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    const field = await screen.findByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'Niveau{Enter}')

    expect(answer).toHaveBeenCalledWith(
      made({ kind: 'scene', title: 'Niveau', folder: 'documents', template: 'basic' }),
    )
  })

  it('answers the template that was picked, not the one it opened on', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Cinéma' }))
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))

    expect(answer).toHaveBeenCalledWith(
      made({ kind: 'scene', title: 'Scène 1', folder: 'documents', template: 'cinematic' }),
    )
  })

  // The other five kinds have one thing to be, and a choice nobody was offered must not travel.
  it('offers no template for a kind that has none, and answers without one', async () => {
    open({ ...ASK, kind: 'image' })
    render(<NewDocumentWindow />)

    await screen.findByRole('textbox')
    expect(screen.queryByRole('button', { name: 'Base' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(answer).toHaveBeenCalledWith(
      made({ kind: 'image', title: 'Image 1', folder: 'documents' }),
    )
  })

  it('marks the chosen template, and only that one', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    expect(await screen.findByRole('button', { name: 'Base' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Vide' })).toHaveAttribute('aria-pressed', 'false')
  })

  // Closing the window says the same thing, and the main process answers `null` for both.
  it('answers nothing when the creation is called off', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }))

    expect(answer).toHaveBeenCalledWith(null)
  })

  it('answers nothing on Escape', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    await userEvent.type(await screen.findByRole('textbox'), '{Escape}')

    expect(answer).toHaveBeenCalledWith(null)
  })

  // Refused where it is typed: a name the folder already holds would be quietly suffixed by the
  // first save, and a document called something its author did not write is the outcome to avoid.
  it('refuses a name the folder already holds', async () => {
    open(ASK, [stored('Niveau.gltf')])
    render(<NewDocumentWindow />)

    const field = await screen.findByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'Niveau')

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
  })

  // The tabs the studio holds, which no folder listing can answer for.
  it('refuses a name only an open tab holds', async () => {
    open({ ...ASK, open: [stored('Brouillon.gltf')] })
    render(<NewDocumentWindow />)

    const field = await screen.findByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'Brouillon')

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
  })

  /**
   * The column is the half this window gained: every kind reachable from everywhere, ordered by
   * the space one came from. Ordered and never filtered — a list that dropped the far kinds would
   * put the studio back where creating depended on the screen one happened to be looking at.
   */
  it('offers every kind, the ones of the space it was opened from first', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    const column = within(await screen.findByRole('navigation'))
    const kinds = column.getAllByRole('listitem').map(row => row.textContent)

    expect(kinds.slice(0, 4)).toEqual(['Scène', 'Interface', 'Matière', 'Ciel'])
    expect(kinds).toHaveLength(8)
  })

  it('names the picked kind, and proposes a name of that kind', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Image' }))

    expect(await screen.findByRole('textbox')).toHaveValue('Image 1')
    expect(screen.getByText('.ora')).toBeInTheDocument()
  })

  /**
   * The fallback moved here with the kind: which folder a document belongs to depends on what it
   * IS, and that is settled in this window now. The studio hands over the Explorer's selection
   * and nothing else.
   */
  it("opens on the kind's own folder when the Explorer pointed at nothing", async () => {
    open({ ...ASK, picked: null })
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Créer' }))

    expect(answer).toHaveBeenCalledWith(
      made({ kind: 'scene', title: 'Scène 1', folder: 'Dossiers/scenes', template: 'basic' }),
    )
  })

  /**
   * Nothing else in the form answers Enter, and after clicking a template tile or a folder the
   * focus sits on a button — where Enter used to re-press it instead of making the document.
   */
  it('creates on Enter from anywhere in the form, not from the name field alone', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Cinéma' }))
    await userEvent.keyboard('{Enter}')

    expect(answer).toHaveBeenCalledWith(
      made({ kind: 'scene', title: 'Scène 1', folder: 'documents', template: 'cinematic' }),
    )
  })

  /** A plain button answers Enter with its own click, and these three keep it. */
  it('leaves Enter to the buttons that have their own answer to it', async () => {
    open(ASK)
    render(<NewDocumentWindow />)

    // Taken back until it HOLDS: the name field grabs focus when the folder lands, and under load
    // that effect settled after a plain `.focus()`, sending Enter to the form — which answered
    // `made` instead of `null`, once in three full gate runs. Measured in isolation the field
    // already holds focus by this point, so waiting on it alone changed nothing.
    const focusOn = async (name: string): Promise<HTMLElement> => {
      const button = await screen.findByRole('button', { name })
      await waitFor(() => {
        button.focus()
        expect(document.activeElement).toBe(button)
      })
      return button
    }

    await focusOn('Annuler')
    await userEvent.keyboard('{Enter}')
    expect(answer).toHaveBeenCalledWith(null)

    answer.mockClear()
    await focusOn('Nouveau dossier')
    await userEvent.keyboard('{Enter}')
    // The field opened instead: nothing was answered, and a document was certainly not made.
    expect(answer).not.toHaveBeenCalled()
  })

  describe('with no project open', () => {
    const NO_PROJECT: NewDocumentAsk = {
      ...ASK,
      projectName: null,
      recentProjects: [{ path: '/projects/Two', openedAt: '2026-09-01T10:00:00.000Z' }],
    }

    /** Dimmed and not hidden: a column that changes length under the eye reads as a fault. */
    it('offers the kinds and refuses them', async () => {
      open(NO_PROJECT)
      render(<NewDocumentWindow />)

      expect(await screen.findByRole('button', { name: 'Scène' })).toBeDisabled()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    // The click this whole lot exists to remove: no closing the window, no hunting the title bar.
    it('offers the shelf of projects, and hands the choice to the studio', async () => {
      open(NO_PROJECT)
      render(<NewDocumentWindow />)

      await userEvent.click(await screen.findByRole('button', { name: 'Two' }))

      expect(answer).toHaveBeenCalledWith({ answer: 'recentProject', path: '/projects/Two' })
    })

    it('hands over the two pickers rather than raising them here', async () => {
      open(NO_PROJECT)
      render(<NewDocumentWindow />)

      await userEvent.click(await screen.findByRole('button', { name: 'Ouvrir un projet' }))
      expect(answer).toHaveBeenCalledWith({ answer: 'openProject' })
    })
  })

  it('shows nothing to fill in when nothing was asked', async () => {
    open(null)
    render(<NewDocumentWindow />)

    await screen.findByText('Nouveau document')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

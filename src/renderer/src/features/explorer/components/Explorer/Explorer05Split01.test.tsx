import { LIST_ONLY } from '@/helpers/collectionState'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { useExplorerView } from '@/stores/explorerView'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  menu,
  picture,
  withProject,
} from './explorerTest-fixtures'

describe('the project explorer, as a grid', () => {
  const showGrid = (): void =>
    void useExplorerView.setState({ collection: { ...LIST_ONLY, view: 'grid' } })

  const tileFor = async (name: string): Promise<HTMLElement> => {
    const caption = await within(await listing()).findByText(name)
    const tile = caption.closest('[draggable]')
    if (!(tile instanceof HTMLElement)) throw new Error(`no tile for ${name}`)
    return tile
  }

  const blank = (): HTMLElement => {
    const host = screen.getByRole('listbox').parentElement
    if (!(host instanceof HTMLElement)) throw new Error('no blank to aim at')
    return host
  }

  const enter = async (name: string): Promise<void> => {
    await userEvent.dblClick(await screen.findByText(name))
  }

  it('lists what the folder it is showing holds, and nothing deeper', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)

    expect(await within(await listing()).findByText('Images')).toBeInTheDocument()
    expect(within(await listing()).getByText('brief.pdf')).toBeInTheDocument()
    // The tree would draw it under its folder; a grid has no nesting to draw it in.
    expect(screen.queryByText('a.png')).toBeNull()
  })

  it('goes into a folder on a double-click, and shows what it holds', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')

    expect(await screen.findByText('a.png')).toBeInTheDocument()
    expect(within(await listing()).queryByText('brief.pdf')).toBeNull()
  })

  it('comes back up by its trail', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    await userEvent.click(screen.getByRole('button', { name: 'Projet' }))

    expect(await within(await listing()).findByText('brief.pdf')).toBeInTheDocument()
  })

  it('walks back out of a folder, and forward into it again', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    await userEvent.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(await within(await listing()).findByText('brief.pdf')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(await screen.findByText('a.png')).toBeInTheDocument()
  })

  it('goes up a level, and offers no way up from the project folder', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    await userEvent.click(screen.getByRole('button', { name: 'Dossier parent' }))

    expect(await within(await listing()).findByText('brief.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dossier parent' })).toBeDisabled()
  })

  it('draws a folder as a shape, and a file as a preview of itself', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('facade.jpg')] })

    render(<Explorer />)

    expect((await tileFor('Images')).querySelector('img')).toBeNull()
    // The shape FILLS the tile: a glyph sized in pixels inside a box that is 64 px at one
    // density and 208 at another is the little sign this replaces.
    expect((await tileFor('Images')).querySelector('svg')).toHaveStyle({ width: '100%' })
    // NEITHER wears a frame: the plate and the border bound a picture that fills a square, and
    // a file now draws a silhouette of its own — the thumbnail is cut to it, not framed by it.
    expect((await tileFor('Images')).querySelector('figure')).not.toHaveClass('bg-surface')
    expect((await tileFor('facade.jpg')).querySelector('figure')).not.toHaveClass('bg-surface')

    expect((await tileFor('facade.jpg')).querySelector('img')).toHaveAttribute(
      'src',
      'ai-desktop-studio://thumb/facade.jpg',
    )
  })

  it('leaves a document its own glyph rather than asking for a preview', async () => {
    withProject()
    showGrid()
    install({ '': [file('a3f1.ora')] }, [picture])

    render(<Explorer />)

    expect((await tileFor('Planche')).querySelector('img')).toBeNull()
  })

  it('moves a tile picked up BY ITS PICTURE, which is what the browser drags from', async () => {
    withProject()
    showGrid()
    const { moveFiles } = install({ '': [folder('Images'), file('facade.jpg')] })

    render(<Explorer />)
    const picture = (await tileFor('facade.jpg')).querySelector('img')
    const data = dragTransfer()
    fireEvent.dragStart(picture!, { dataTransfer: data })
    fireEvent.drop(await tileFor('Images'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['facade.jpg'], 'Images')
  })

  it('draws the trail below the rows rather than above them', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images')] })

    render(<Explorer />)
    const trail = await screen.findByRole('navigation', { name: 'Dossier affiché' })

    expect((await tileFor('Images')).compareDocumentPosition(trail)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('moves a tile dropped on a folder into it', async () => {
    withProject()
    showGrid()
    const { moveFiles } = install({ '': [folder('notes'), file('brief.pdf')] })

    render(<Explorer />)
    const data = dragTransfer()
    fireEvent.dragStart(await tileFor('brief.pdf'), { dataTransfer: data })
    fireEvent.drop(await tileFor('notes'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['brief.pdf'], 'notes')
  })

  it('aims a drop on the blank at the folder being shown', async () => {
    withProject()
    showGrid()
    const { moveFiles } = install({
      '': [folder('Images')],
      Images: [folder('Rendus', 'Images'), file('a.png', 'Images')],
    })

    render(<Explorer />)
    await enter('Images')

    const data = dragTransfer()
    fireEvent.dragStart(await tileFor('a.png'), { dataTransfer: data })
    fireEvent.drop(blank(), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['Images/a.png'], 'Images')
  })

  it('says an empty folder is empty, not that the project could not be read', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Vide')], Vide: [] })

    render(<Explorer />)
    await enter('Vide')

    expect(await screen.findByText(/ne contient rien/)).toBeInTheDocument()
    expect(screen.queryByText(/n’a pas pu être lu/)).toBeNull()
  })

  it('unpicks what was held when it changes folder', async () => {
    withProject()
    showGrid()
    const { trashFiles } = install({
      '': [folder('Images'), file('brief.pdf')],
      Images: [file('a.png', 'Images')],
    })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('brief.pdf'))
    await enter('Images')
    await screen.findByText('a.png')

    fireEvent.keyDown(window, { key: 'Backspace', code: 'Backspace', metaKey: true })

    await waitFor(() => expect(screen.getByText('a.png')).toBeInTheDocument())
    expect(trashFiles).not.toHaveBeenCalled()
  })

  it('still makes a folder from the blank of an empty one', async () => {
    withProject()
    showGrid()
    const { newFolder } = install({ '': [folder('Vide')], Vide: [] })

    render(<Explorer />)
    await enter('Vide')
    await screen.findByText(/ne contient rien/)

    menu.picks('Nouveau dossier')
    fireEvent.contextMenu(screen.getByText(/ne contient rien/))

    await waitFor(() => expect(newFolder).toHaveBeenCalledWith('Vide', 'dossier'))
  })

  it('aims the blank at the project folder once a search has flattened the grid', async () => {
    withProject()
    showGrid()
    const { moveFiles } = install(
      { '': [folder('Images')], Images: [file('a.png', 'Images')] },
      [],
      [],
      { png: [file('a.png', 'Images')] },
    )

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    act(() =>
      useExplorerView.setState({ collection: { ...LIST_ONLY, view: 'grid', search: 'png' } }),
    )
    await screen.findByText('a.png')

    const data = dragTransfer()
    fireEvent.dragStart(await tileFor('a.png'), { dataTransfer: data })
    fireEvent.drop(blank(), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['Images/a.png'], '')
  })

  it('falls back to the project folder when the one it shows is folded away', async () => {
    withProject()
    showGrid()
    install({ '': [folder('Images'), file('brief.pdf')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    act(() => useExplorerView.setState({ collection: { ...LIST_ONLY, view: 'list' } }))
    await userEvent.click(await within(await listing()).findByText('Images'))
    await userEvent.keyboard('{ArrowLeft}')
    act(() => useExplorerView.setState({ collection: { ...LIST_ONLY, view: 'grid' } }))

    expect(await within(await listing()).findByText('brief.pdf')).toBeInTheDocument()
  })

  it('pastes into the folder it is showing, not where the anchor points', async () => {
    withProject()
    showGrid()
    const { pasteFiles } = install({
      '': [folder('Images'), file('brief.pdf')],
      Images: [file('a.png', 'Images')],
    })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('brief.pdf'))
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC', metaKey: true })
    await enter('Images')
    await screen.findByText('a.png')

    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', metaKey: true })

    await waitFor(() => expect(pasteFiles).toHaveBeenCalledWith(['brief.pdf'], 'Images', false))
  })

  it('makes a new folder in the folder being shown, from the blank', async () => {
    withProject()
    showGrid()
    const { newFolder } = install({ '': [folder('Images')], Images: [file('a.png', 'Images')] })

    render(<Explorer />)
    await enter('Images')
    await screen.findByText('a.png')

    menu.picks('Nouveau dossier')
    fireEvent.contextMenu(blank())

    await waitFor(() => expect(newFolder).toHaveBeenCalledWith('Images', 'dossier'))
  })

  it('raises a tile’s own menu on a right-click, asking the catalogue first', async () => {
    withProject()
    showGrid()
    install({ '': [file('brief.pdf')] })

    render(<Explorer />)
    fireEvent.contextMenu(await tileFor('brief.pdf'))

    await waitFor(() => expect(menu.labels()).toContain('Renommer'))
  })

  it('ends both menus on the file stack, greyed while it holds nothing', async () => {
    withProject()
    showGrid()
    install({ '': [file('brief.pdf')] })

    render(<Explorer />)
    const tile = await tileFor('brief.pdf')
    fireEvent.contextMenu(blank())

    await waitFor(() => expect(menu.labels()).toContain('Annuler'))
    expect(menu.labels()).toContain('Rétablir')
    expect(menu.offers('Annuler')).toBe(false)
    expect(menu.offers('Rétablir')).toBe(false)

    fireEvent.contextMenu(tile)

    await waitFor(() => expect(menu.labels()).toContain('Annuler'))
    expect(menu.labels()).toContain('Rétablir')
    expect(menu.offers('Annuler')).toBe(false)
    expect(menu.offers('Rétablir')).toBe(false)
  })

  it('carries the whole selection when one of its tiles is dragged', async () => {
    withProject()
    showGrid()
    const { moveFiles } = install({ '': [folder('notes'), file('a.png'), file('b.png')] })

    // One session for the whole gesture: the modifier is held across two clicks, and the direct
    // API opens a fresh one per call — which drops the key between them.
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{Meta>}')
    await user.click(screen.getByText('b.png'))
    await user.keyboard('{/Meta}')

    const data = dragTransfer()
    fireEvent.dragStart(await tileFor('b.png'), { dataTransfer: data })
    fireEvent.drop(await tileFor('notes'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['a.png', 'b.png'], 'notes')
  })

  it('will not pick up what the studio keeps for itself', async () => {
    withProject()
    showGrid()
    useExplorerView.setState({ hidden: true })
    install({ '': [file('.project.json'), file('brief.pdf')] })

    render(<Explorer />)

    expect(await tileFor('.project.json')).toHaveAttribute('draggable', 'false')
    expect(await tileFor('brief.pdf')).toHaveAttribute('draggable', 'true')
  })

  it('refuses a folder the studio keeps for itself as a drop target', async () => {
    withProject()
    showGrid()
    useExplorerView.setState({ hidden: true })
    const { moveFiles } = install({ '': [folder('.index'), file('brief.pdf')] })

    render(<Explorer />)
    const data = dragTransfer()
    fireEvent.dragStart(await tileFor('brief.pdf'), { dataTransfer: data })
    fireEvent.drop(await tileFor('.index'), { dataTransfer: data })

    expect(moveFiles).not.toHaveBeenCalled()
  })

  it('dims a tile that has been cut', async () => {
    withProject()
    showGrid()
    install({ '': [file('a.png')] })

    render(<Explorer />)
    await userEvent.click(await screen.findByText('a.png'))
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX', metaKey: true })

    await waitFor(async () => expect(await tileFor('a.png')).toHaveClass('opacity-50'))
  })
})

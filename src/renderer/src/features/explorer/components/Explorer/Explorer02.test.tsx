import { dragTransfer } from '@/helpers/drag-fixtures'
import { useExplorerView } from '@/stores/explorerView'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Explorer, file, folder, install, listing, withProject } from './explorerTest-fixtures'

describe('dragging a row of the explorer', () => {
  const rowFor = async (name: string): Promise<HTMLElement> => {
    const label = await within(await listing()).findByText(name)
    const row = label.closest('[role="treeitem"]')
    if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`)
    return row
  }

  const drag = async (from: string, onto: string): Promise<void> => {
    const data = dragTransfer()
    fireEvent.dragStart(await rowFor(from), { dataTransfer: data })
    // The hover comes first, as the browser sends it: it is where the tree resolves what a
    // release would do, and the drop reports that same answer.
    fireEvent.dragOver(await rowFor(onto), { dataTransfer: data })
    fireEvent.drop(await rowFor(onto), { dataTransfer: data })
  }

  it('moves the dragged file into the folder it was dropped on', async () => {
    withProject()
    const { moveFiles } = install({ '': [folder('notes'), file('brief.pdf')] })

    render(<Explorer />)
    await drag('brief.pdf', 'notes')

    expect(moveFiles).toHaveBeenCalledWith(['brief.pdf'], 'notes')
  })

  it('moves it by its whole path, not by the name the row shows', async () => {
    withProject()
    const { moveFiles } = install({
      '': [folder('notes'), folder('refs')],
      notes: [file('brief.pdf', 'notes')],
    })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('notes'))
    await userEvent.keyboard('{ArrowRight}')
    await drag('brief.pdf', 'refs')

    expect(moveFiles).toHaveBeenCalledWith(['notes/brief.pdf'], 'refs')
  })

  // What the machine keeps refuses on both sides of the gesture — as what moves, and as what
  // receives. The folders the user was given are picked up like any other.
  it('will not pick up what the machine keeps for itself', async () => {
    withProject()
    useExplorerView.setState({ hidden: true })
    install({ '': [file('.project.json'), folder('assets')] })

    render(<Explorer />)

    expect(await rowFor('.project.json')).not.toHaveAttribute('draggable', 'true')
    expect(await rowFor('assets')).toHaveAttribute('draggable', 'true')
  })

  it('drops nothing into what the machine keeps for itself', async () => {
    withProject()
    useExplorerView.setState({ hidden: true })
    const { moveFiles } = install({ '': [folder('.index'), file('brief.pdf')] })

    render(<Explorer />)
    await drag('brief.pdf', '.index')

    expect(moveFiles).not.toHaveBeenCalled()
  })

  // A file is not a place. Dropping onto one used to be worth an outline it could not honour.
  it('drops nothing onto a file', async () => {
    withProject()
    const { moveFiles } = install({ '': [file('brief.pdf'), file('notes.txt')] })

    render(<Explorer />)
    await drag('brief.pdf', 'notes.txt')

    expect(moveFiles).not.toHaveBeenCalled()
  })

  it('drops nothing onto a folder inside the one being dragged', async () => {
    withProject()
    const { moveFiles } = install({
      '': [folder('notes')],
      notes: [folder('drafts', 'notes')],
    })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('notes'))
    await userEvent.keyboard('{ArrowRight}')
    await drag('notes', 'drafts')

    expect(moveFiles).not.toHaveBeenCalled()
  })
})

/**
 * Picking more than one row, and doing something to all of them.
 *
 * The panel used to drop the `mode` the tree resolved — `onSelect={setSelectedIds}` — so every
 * ⌘-click REPLACED the selection instead of adding to it, in a panel whose whole point is to
 * move several files at once.
 */
describe('picking several rows of the explorer', () => {
  const rowFor = async (name: string): Promise<HTMLElement> => {
    const label = await within(await listing()).findByText(name)
    const row = label.closest('[role="treeitem"]')
    if (!(row instanceof HTMLElement)) throw new Error(`no row for ${name}`)
    return row
  }

  const picked = (): string[] =>
    screen
      .getAllByRole('treeitem')
      .filter(row => row.getAttribute('aria-selected') === 'true')
      .map(row => row.textContent ?? '')

  /**
   * One session for the whole gesture, in every case here: the direct API opens a new one per
   * call, and the held modifier is released before the click that is supposed to read it.
   */
  it('adds to what is already picked on a command-click', async () => {
    withProject()
    install({ '': [file('a.png'), file('b.png'), file('c.png')] })
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{Meta>}')
    await user.click(await screen.findByText('c.png'))
    await user.keyboard('{/Meta}')

    expect(picked()).toEqual(['a.png', 'c.png'])
  })

  it('takes the whole range on a shift-click', async () => {
    withProject()
    install({ '': [file('a.png'), file('b.png'), file('c.png')] })
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{Shift>}')
    await user.click(await screen.findByText('c.png'))
    await user.keyboard('{/Shift}')

    expect(picked()).toEqual(['a.png', 'b.png', 'c.png'])
  })

  // The batch is settled when the drag STARTS and read on every hover: the platform answers
  // nothing about a payload until the drop, so a target could not otherwise know what is coming.
  it('carries the whole selection when one of its rows is dragged', async () => {
    withProject()
    const { moveFiles } = install({ '': [folder('notes'), file('a.png'), file('b.png')] })
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{Meta>}')
    await user.click(await screen.findByText('b.png'))
    await user.keyboard('{/Meta}')

    const data = dragTransfer()
    fireEvent.dragStart(await rowFor('a.png'), { dataTransfer: data })
    fireEvent.dragOver(await rowFor('notes'), { dataTransfer: data })
    fireEvent.drop(await rowFor('notes'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['a.png', 'b.png'], 'notes')
  })

  /**
   * A file inside a folder that is being moved travels WITH the folder: naming it as well would
   * hand the disk a path that no longer exists by the time its turn comes.
   */
  it('leaves out a file whose own folder is in the batch', async () => {
    withProject()
    const { moveFiles } = install({
      '': [folder('notes'), folder('keep')],
      notes: [file('a.png', 'notes')],
    })
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await within(await listing()).findByText('notes'))
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{Meta>}')
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{/Meta}')

    const data = dragTransfer()
    fireEvent.dragStart(await rowFor('notes'), { dataTransfer: data })
    fireEvent.dragOver(await rowFor('keep'), { dataTransfer: data })
    fireEvent.drop(await rowFor('keep'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['notes'], 'keep')
  })

  // What every file browser does, and what keeps a slip of the hand from moving thirty files.
  it('drags a row outside the selection alone, leaving the selection whole', async () => {
    withProject()
    const { moveFiles } = install({ '': [folder('notes'), file('a.png'), file('b.png')] })

    render(<Explorer />)
    await userEvent.click(await screen.findByText('a.png'))

    const data = dragTransfer()
    fireEvent.dragStart(await rowFor('b.png'), { dataTransfer: data })
    fireEvent.dragOver(await rowFor('notes'), { dataTransfer: data })
    fireEvent.drop(await rowFor('notes'), { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['b.png'], 'notes')
  })

  /**
   * How a file comes back OUT of a folder: no row stands for the project folder, so the blank
   * below the tree is what names it.
   */
  it('sends a file to the project folder when it is dropped on the blank below the rows', async () => {
    withProject()
    const { moveFiles } = install({
      '': [folder('notes')],
      notes: [file('a.png', 'notes')],
    })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('notes'))
    await userEvent.keyboard('{ArrowRight}')

    const data = dragTransfer()
    fireEvent.dragStart(await rowFor('a.png'), { dataTransfer: data })
    const blank = screen.getByRole('tree').parentElement
    fireEvent.drop(blank!, { dataTransfer: data })

    expect(moveFiles).toHaveBeenCalledWith(['notes/a.png'], '')
  })
})

/**
 * The eight commands, which act on the SELECTION rather than on a row — the whole point of the
 * scope. Heard only while the focus is inside the panel: a ⌘Z in the canvas must not reach the
 * disk, and `commandFor` filters by scope for exactly that.
 */
describe('the explorer commands', () => {
  it('holds a cut selection back until a folder is named to paste it into', async () => {
    withProject()
    const { pasteFiles, moveFiles } = install({ '': [folder('notes'), file('a.png')] })

    render(<Explorer />)
    await userEvent.click(await screen.findByText('a.png'))
    await userEvent.keyboard('{Meta>}x{/Meta}')

    // Nothing has moved yet, and nothing will until the paste says where.
    expect(moveFiles).not.toHaveBeenCalled()

    await userEvent.click(await within(await listing()).findByText('notes'))
    await userEvent.keyboard('{Meta>}v{/Meta}')

    expect(pasteFiles).toHaveBeenCalledWith(['a.png'], 'notes', true)
  })

  // A copy stays on the clipboard, so pasting into three folders in a row is three copies rather
  // than one and two silences.
  it('pastes a copy into the folder on screen, and keeps it for the next one', async () => {
    withProject()
    const { pasteFiles } = install({ '': [folder('notes'), folder('refs'), file('a.png')] })

    render(<Explorer />)
    await userEvent.click(await screen.findByText('a.png'))
    await userEvent.keyboard('{Meta>}c{/Meta}')
    await userEvent.click(await within(await listing()).findByText('notes'))
    await userEvent.keyboard('{Meta>}v{/Meta}')
    await userEvent.click(await screen.findByText('refs'))
    await userEvent.keyboard('{Meta>}v{/Meta}')

    expect(pasteFiles).toHaveBeenNthCalledWith(1, ['a.png'], 'notes', false)
    expect(pasteFiles).toHaveBeenNthCalledWith(2, ['a.png'], 'refs', false)
  })

  it('duplicates and trashes the whole selection at once', async () => {
    withProject()
    const { duplicateFiles, trashFiles } = install({ '': [file('a.png'), file('b.png')] })
    const user = userEvent.setup()

    render(<Explorer />)
    await user.click(await screen.findByText('a.png'))
    await user.keyboard('{Meta>}')
    await user.click(await screen.findByText('b.png'))
    await user.keyboard('{/Meta}')

    await user.keyboard('{Meta>}d{/Meta}')
    expect(duplicateFiles).toHaveBeenCalledWith(['a.png', 'b.png'])

    await user.keyboard('{Meta>}{Backspace}{/Meta}')
    expect(trashFiles).toHaveBeenCalledWith(['a.png', 'b.png'])
  })

  // The folder on screen is the picked row when it is one, and the project folder when nothing
  // is picked — which is what makes ⇧⌘N work before anything has been clicked.
  it('makes a folder inside the picked one, and at the root when nothing is picked', async () => {
    withProject()
    const { newFolder } = install({ '': [folder('notes')] })

    render(<Explorer />)
    await within(await listing()).findByText('notes')
    // Focused without being clicked, which is the state the first case is about: the panel arms
    // its scope on the focus, and nothing is picked yet. Inside `act`, or the effect that
    // subscribes to the keyboard has not run by the time the key below is pressed.
    await act(async () => screen.getAllByRole('treeitem')[0]?.focus())
    fireEvent.keyDown(window, { key: 'N', code: 'KeyN', metaKey: true, shiftKey: true })

    await waitFor(() => expect(newFolder).toHaveBeenCalledWith('', 'dossier'))

    await userEvent.click(await within(await listing()).findByText('notes'))
    fireEvent.keyDown(window, { key: 'N', code: 'KeyN', metaKey: true, shiftKey: true })

    await waitFor(() => expect(newFolder).toHaveBeenCalledWith('notes', 'dossier'))
  })

  /**
   * The blank raises a menu of its own now, and it aims at the project folder — so the right-click
   * has to unpick what was picked, exactly as a press there does. Reported from use: in a project
   * whose rows are all folders, a right-click in the empty space offered nothing at all, and there
   * was no way to make a folder at the root.
   */
  it('aims at the project folder when the blank is right-clicked, whatever was picked', async () => {
    withProject()
    const { newFolder } = install({ '': [folder('notes')] })

    render(<Explorer />)
    await userEvent.click(await within(await listing()).findByText('notes'))

    fireEvent.contextMenu(screen.getByRole('tree').parentElement!)
    fireEvent.keyDown(window, { key: 'N', code: 'KeyN', metaKey: true, shiftKey: true })

    await waitFor(() => expect(newFolder).toHaveBeenCalledWith('', 'dossier'))
  })

  // Heard by the panel and nowhere else: the stack lives in the main process, and the scope is
  // what keeps a ⌘Z aimed at a canvas from reaching the disk.
  it('asks the main process to take the last batch back', async () => {
    withProject()
    const { undoFile } = install({ '': [file('a.png')] })

    render(<Explorer />)
    await userEvent.click(await screen.findByText('a.png'))
    await userEvent.keyboard('{Meta>}z{/Meta}')

    expect(undoFile).toHaveBeenCalled()
  })
})

/**
 * Three rows, and two of them refuse in cases the panel can name. Nothing is deleted: the file
 * goes to the system's trash, where its owner can get it back.
 */

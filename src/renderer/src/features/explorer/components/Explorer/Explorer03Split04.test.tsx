import { LIST_ONLY } from '@/helpers/collectionState'
import { useExplorerView } from '@/stores/explorerView'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Explorer, file, folder, install, withProject } from './explorerTest-fixtures'

describe('searching the explorer', () => {
  const searching = (term: string): void => {
    useExplorerView.setState({ collection: { ...LIST_ONLY, search: term } })
  }

  /**
   * What the whole second source exists for. The tree reads one folder at a time, so a file
   * three folds down is a file it has never seen — and the chain of folders above the match has
   * to be rebuilt here, `flattenTree` dropping a node whose parent it does not hold.
   */
  it('draws a match nobody had unfolded, and the folders leading to it', async () => {
    withProject()
    searching('ruelle')
    install({ '': [folder('Repérages')] }, [], [], {
      ruelle: [file('ruelle-bleue.png', 'Repérages/Ruelles')],
    })

    render(<Explorer />)

    expect(await screen.findByText('ruelle-bleue.png')).toBeInTheDocument()
    expect(screen.getByText('Repérages')).toBeInTheDocument()
    expect(screen.getByText('Ruelles')).toBeInTheDocument()
  })

  /**
   * The field is drawn INSIDE the panel, under its title row: a word that matches nothing would
   * otherwise take the field it was typed in off the screen, leaving no way back to the folder.
   * It is also why the bar is not in the title row at all — measured on the home's left column,
   * the field was 76 px wide there.
   */
  it('says so when nothing answers to the word, and keeps the field on screen', async () => {
    withProject()
    searching('licorne')
    install({ '': [folder('Repérages')] })

    render(<Explorer />)

    expect(await screen.findByText(/Aucun fichier de ce projet/)).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('licorne')
  })

  // The bar and the tree are one panel: what is typed reaches the second through the store.
  it('narrows the tree from the field under its title', async () => {
    withProject()
    install({ '': [folder('Repérages')] })

    render(<Explorer />)
    await userEvent.type(await screen.findByRole('searchbox'), 'ruelle')

    expect(useExplorerView.getState().collection.search).toBe('ruelle')
  })

  /** The lazy source comes back untouched — it is the one the panel never stopped holding. */
  it('puts the folders back when the search is left', async () => {
    withProject()
    searching('ruelle')
    install({ '': [folder('Repérages')] }, [], [], {
      ruelle: [file('ruelle-bleue.png', 'Repérages/Ruelles')],
    })

    render(<Explorer />)
    await screen.findByText('ruelle-bleue.png')
    act(() => searching(''))

    expect(await screen.findByText('Repérages')).toBeInTheDocument()
    expect(screen.queryByText('ruelle-bleue.png')).not.toBeInTheDocument()
  })

  /**
   * Shown, and only shown: what a dot hides is refused by every gesture on both sides
   * (`filePlan.test.ts`). Which entries come back is the main process's answer, so what is read
   * here is that the panel asked for them.
   */
  it('asks the folder for what a dot hides once the reader wants it', async () => {
    withProject()
    useExplorerView.setState({ hidden: true })
    const { listFolder } = install({ '': [file('.project.json')] })

    render(<Explorer />)

    await waitFor(() => expect(listFolder).toHaveBeenCalledWith('', true))
  })
})

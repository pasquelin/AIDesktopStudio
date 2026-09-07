import { LIST_ONLY } from '@/helpers/collectionState'
import { useExplorerView } from '@/stores/explorerView'
import { useMedia } from '@/stores/media'
import { useTreeFolds } from '@/stores/treeFolds'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExplorerActions } from './ExplorerActions'

const createInputMapFromPreset = vi.hoisted(() => vi.fn(async () => 'character.input.json'))
vi.mock('@/features/input/createInputMap', () => ({ createInputMapFromPreset }))

beforeEach(() => {
  useExplorerView.setState({ collection: LIST_ONLY, hidden: false, mode: 'folder' })
  useMedia.setState({ capabilities: { ffmpeg: true } })
  useTreeFolds.setState({
    explorer: { stamp: 0, wanted: true, anyExpanded: true },
    scene: { stamp: 0, wanted: true, anyExpanded: false },
  })
})

describe('the explorer title row', () => {
  it('creates a control map from a chosen preset', async () => {
    render(<ExplorerActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle carte de contrôles' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Personnage' }))

    expect(createInputMapFromPreset).toHaveBeenCalledWith('character')
  })

  it('turns the studio own files on and off', async () => {
    render(<ExplorerActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Éléments cachés' }))
    expect(useExplorerView.getState().hidden).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Éléments cachés' }))
    expect(useExplorerView.getState().hidden).toBe(false)
  })

  // Two readings of one folder, drawn as a pair: which one is on is what says the other exists.
  it('switches between the two readings of the folder', async () => {
    render(<ExplorerActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Par domaine' }))
    expect(useExplorerView.getState().mode).toBe('domain')

    await userEvent.click(screen.getByRole('button', { name: 'Par dossier' }))
    expect(useExplorerView.getState().mode).toBe('folder')
  })

  /**
   * The row carries the panel's name, these three and the way out. The search bar rode here
   * first and the screen settled it: the field measured 76 px on the home's left column, which
   * is « Rechercher… » cut to « Rech… ». It is drawn under the title now.
   */
  it('leaves the row to the three readings, and carries no field', () => {
    render(<ExplorerActions />)

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('carries the tree fold action in the title row', async () => {
    render(<ExplorerActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Tout replier' }))

    expect(useTreeFolds.getState().explorer).toMatchObject({ stamp: 1, wanted: false })
  })
})

/**
 * It followed the import here: nothing else on screen says a proxy and a waveform will not be
 * made, and the panel that used to carry it no longer imports anything.
 */
it('says the encoder is missing, where the import now lives', () => {
  useMedia.setState({ capabilities: { ffmpeg: false } })

  render(<ExplorerActions />)

  expect(screen.getByRole('img', { name: /Préparation vidéo indisponible/ })).toBeInTheDocument()
})

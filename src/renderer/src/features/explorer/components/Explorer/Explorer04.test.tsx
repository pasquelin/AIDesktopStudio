import { useExplorerView } from '@/stores/explorerView'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  Explorer,
  file,
  folder,
  install,
  listing,
  scene,
  withProject,
} from './explorerTest-fixtures'

describe('the explorer read by domain', () => {
  const byDomain = (): void => {
    useExplorerView.setState({ mode: 'domain' })
  }

  const project = [
    file('ruelle.png', 'Repérages'),
    file('toit.png', 'Repérages'),
    file('notes.pdf'),
  ]

  /**
   * The second reading of one folder: where the tree answers « where does this sit », this
   * answers « what does this project hold ». The count is what a reader comes here for.
   */
  it('groups every file of the project by what it is', async () => {
    withProject()
    byDomain()
    install({ '': [folder('Repérages')] }, [], [], {}, project)

    render(<Explorer />)

    expect(await screen.findByText('Image')).toBeInTheDocument()
    expect(screen.getByText('Autre')).toBeInTheDocument()
    expect(screen.getByText('ruelle.png')).toBeInTheDocument()
    expect(screen.getByText('notes.pdf')).toBeInTheDocument()
    // Two pictures under one heading, one file under the other.
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  /**
   * The whole reason the catalogue is asked at all: an extension cannot tell an albedo from a
   * normal map, and a row that has been corrected files the picture where it belongs.
   */
  it('files a picture where the catalogue says, not where its extension does', async () => {
    withProject()
    byDomain()
    install(
      { '': [folder('Repérages')] },
      [],
      [
        {
          id: 'asset_1',
          name: 'Ruelle',
          type: 'skybox',
          location: 'local',
          path: 'Repérages/ruelle.png',
          tags: [],
          createdAt: '2026-08-17T10:00:00.000Z',
        },
      ],
      {},
      project,
    )

    render(<Explorer />)

    expect(await screen.findByText('Skybox')).toBeInTheDocument()
  })

  /**
   * A `.gltf` and a `.glb` are both filed under Maillage, and one of them opens in the studio
   * where the other is a source it reads. The row already says which: a document is drawn by its
   * TITLE and wears its space's glyph, off the same table the rail and the asset menu read,
   * where a plain file keeps its file name and the generic one. That is the distinction, drawn
   * in the vocabulary the whole studio already uses — a word "document" beside it would be a
   * second one, on the narrowest column the studio has.
   */
  it('tells a document from a source filed under the same domain', async () => {
    withProject()
    byDomain()
    const filed = { ...scene, path: 'Acte 1/a3f1.gltf' }
    install({ '': [folder('Acte 1')] }, [filed], [], {}, [
      file('a3f1.gltf', 'Acte 1'),
      file('chaise.glb', 'Acte 1'),
    ])

    render(<Explorer />)

    // The document by its title, the source by its file name.
    expect(await screen.findByText('Niveau')).toBeInTheDocument()
    expect(screen.getByText('chaise.glb')).toBeInTheDocument()
    expect(within(await listing()).queryByText('a3f1.gltf')).not.toBeInTheDocument()
  })

  /** A source needs none: its own name IS the directory entry, extension and all. */
  it('says which format a document is written in, beside its name', async () => {
    withProject()
    byDomain()
    const filed = { ...scene, path: 'Acte 1/Niveau.gltf' }
    install({ '': [folder('Acte 1')] }, [filed], [], {}, [
      file('Niveau.gltf', 'Acte 1'),
      file('chaise.glb', 'Acte 1'),
    ])

    render(<Explorer />)

    expect(await screen.findByText('.gltf')).toBeInTheDocument()
    expect(screen.queryByText('.glb')).not.toBeInTheDocument()
  })

  /**
   * A document written before the file was named after it wears a uuid and shows its TITLE.
   * `Niveau .gltf` would then name no file at all — the row would send a reader looking for one.
   */
  it('leaves the extension off a document whose file is not named after it', async () => {
    withProject()
    byDomain()
    const filed = { ...scene, path: 'Acte 1/a3f1.gltf' }
    install({ '': [folder('Acte 1')] }, [filed], [], {}, [file('a3f1.gltf', 'Acte 1')])

    render(<Explorer />)

    expect(await screen.findByText('Niveau')).toBeInTheDocument()
    expect(screen.queryByText('.gltf')).not.toBeInTheDocument()
  })

  /** A domain names files rather than holding a place: nothing can be selected or written there. */
  it('folds a domain shut rather than picking it', async () => {
    withProject()
    byDomain()
    install({ '': [folder('Repérages')] }, [], [], {}, project)

    render(<Explorer />)
    await userEvent.click(await screen.findByText('Autre'))

    expect(selectedFilePaths(useSelection.getState())).toEqual([])
    await userEvent.dblClick(screen.getByText('Autre'))
    await waitFor(() => expect(screen.queryByText('notes.pdf')).not.toBeInTheDocument())
  })

  // Leaving a reading must not cost the other one: the tree is the source the panel never
  // stopped holding, and it comes back with its folders as they were.
  it('gives the folders back when the reading changes', async () => {
    withProject()
    byDomain()
    install({ '': [folder('Repérages')] }, [], [], {}, project)

    render(<Explorer />)
    await screen.findByText('notes.pdf')
    act(() => useExplorerView.setState({ mode: 'folder' }))

    expect(await screen.findByText('Repérages')).toBeInTheDocument()
    expect(screen.queryByText('Image')).not.toBeInTheDocument()
  })
})

/**
 * The grid is the same folder drawn a second way, so every gesture the tree answers has to answer
 * here too — and not one of them is anything the type checker can say.
 */

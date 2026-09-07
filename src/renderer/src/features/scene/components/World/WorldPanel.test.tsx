import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useDocuments } from '@/stores/documents'
import { useSceneViews } from '@/stores/sceneViews'
import { WorldPanel } from './WorldPanel'

function sceneWithTerrain() {
  const scene = createDefaultScene()
  return {
    ...scene,
    world: {
      ...scene.world,
      layers: [
        reliefLayer(
          { assetId: 'h' },
          {
            id: 'island',
            name: 'Island',
            edits: [terrainEditLayer({ id: 'hills', name: 'Hills' })],
          },
        ),
      ],
    },
  }
}

describe('WorldPanel', () => {
  beforeEach(() => {
    useSceneViews.setState({ views: {} })
    installScene('doc-1', sceneWithTerrain())
  })

  it('says so when no document is in front, rather than showing an empty world', () => {
    useDocuments.setState({ activeId: null })
    render(<WorldPanel />)

    expect(screen.getByText('Ouvrez une scène pour voir son relief.')).toBeInTheDocument()
  })

  it('lists the terrain and nests its edits underneath', () => {
    render(<WorldPanel />)

    expect(screen.getByText('Island')).toBeInTheDocument()
    expect(screen.getByText('Hills')).toBeInTheDocument()
  })

  it('renames an edit on a double click', async () => {
    render(<WorldPanel />)
    await userEvent.dblClick(screen.getByText('Hills'))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), 'Dunes{Enter}')

    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer && layer.kind === 'relief' ? layer.edits[0]?.name : '').toBe('Dunes')
  })

  it('reorders terrains by dragging a row', () => {
    const scene = sceneWithTerrain()
    installScene('doc-1', {
      ...scene,
      world: {
        ...scene.world,
        layers: [
          reliefLayer({ assetId: 'a' }, { id: 'a', name: 'Alpha' }),
          reliefLayer({ assetId: 'b' }, { id: 'b', name: 'Beta' }),
        ],
      },
    })
    render(<WorldPanel />)

    const [alpha, beta] = screen.getAllByRole('treeitem')
    const data = dragTransfer()
    fireEvent.dragStart(beta!, { dataTransfer: data })
    const row = alpha!
    // The handler reads `top` and `height`; the rest of a rectangle would say nothing here.
    row.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
    fireEvent.dragOver(row, { dataTransfer: data, clientY: 3 })
    fireEvent.drop(row, { dataTransfer: data, clientY: 3 })

    expect(sceneOf(useScenes.getState(), 'doc-1').world.layers.map(layer => layer.id)).toEqual([
      'b',
      'a',
    ])
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useDocuments } from '@/stores/documents'
import { useSceneViews } from '@/stores/sceneViews'
import { WorldActions } from './WorldActions'

describe('WorldActions', () => {
  beforeEach(() => {
    useSceneViews.setState({ views: {} })
    installScene('doc-1')
  })

  it('offers no world action when no document is in front', () => {
    useDocuments.setState({ activeId: null })
    render(<WorldActions />)

    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument()
  })

  it('adds a terrain', async () => {
    render(<WorldActions />)
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Terrain' }))
    expect(sceneOf(useScenes.getState(), 'doc-1').world.layers).toHaveLength(1)
    expect(sceneOf(useScenes.getState(), 'doc-1').world.layers[0]?.kind).toBe('relief')
  })

  it('adds a scatter layer from the same add menu', async () => {
    render(<WorldActions />)
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dispersion' }))
    expect(sceneOf(useScenes.getState(), 'doc-1').world.layers[0]?.kind).toBe('scatter')
  })

  it('adds an edit on the armed terrain', async () => {
    const scene = createDefaultScene()
    installScene('doc-1', {
      ...scene,
      world: {
        ...scene.world,
        layers: [
          reliefLayer(
            { assetId: 'h' },
            { id: 'island', edits: [terrainEditLayer({ id: 'sculpt' })] },
          ),
        ],
      },
    })
    useSceneViews.getState().setArmedWorld('doc-1', { kind: 'relief', id: 'island', editId: null })
    render(<WorldActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une retouche' }))

    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer && layer.kind === 'relief' ? layer.edits : []).toHaveLength(2)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { reliefLayer, scatterLayer, terrainEditLayer } from '@shared/domain/scene'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
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
            groundMaterials: [{ albedo: { assetId: 'soil' }, normal: null, channel: 'r' }],
          },
        ),
      ],
    },
  }
}

describe('WorldTools sculpt session', () => {
  beforeEach(() => {
    useSceneViews.setState({ views: {} })
    installScene('doc-1', sceneWithTerrain())
    useSceneViews.getState().setArmedRelief('doc-1', { terrainId: 'island', editId: 'hills' })
  })

  it('turns sculpt on and drops pose mode if it was on', async () => {
    useSceneViews.getState().setPoseMode('doc-1', true)
    render(<WorldPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Sculpter' }))

    const view = sceneViewOf(useSceneViews.getState(), 'doc-1')
    expect(view.sculptMode).toBe(true)
    expect(view.poseMode).toBe(false)
  })

  it('turns sculpt off again on the next press, restoring pose as a choice', async () => {
    render(<WorldPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Sculpter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sculpter' }))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').sculptMode).toBe(false)
  })

  it('writes the brush amount onto the session, leaving the document alone', () => {
    render(<WorldPanel />)

    fireEvent.change(screen.getByLabelText('Intensité'), { target: { value: '0.3' } })

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').sculptAmount).toBe(0.3)
  })

  it('arms smooth as the exclusive disk tool', async () => {
    render(<WorldPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Lisser' }))

    const view = sceneViewOf(useSceneViews.getState(), 'doc-1')
    expect(view.sculptMode).toBe(true)
    expect(view.sculptTool).toBe('smooth')
  })

  it('turns flatten off again on the next press', async () => {
    render(<WorldPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Aplanir' }))
    await userEvent.click(screen.getByRole('button', { name: 'Aplanir' }))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').sculptMode).toBe(false)
  })

  it('adds and arms the next ground material channel', async () => {
    render(<WorldPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une matière' }))

    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer?.kind === 'relief' ? layer.groundMaterials : []).toEqual([
      { albedo: { assetId: 'soil' }, normal: null, channel: 'r' },
      { albedo: { assetId: 'soil' }, normal: null, channel: 'g' },
    ])
    expect(sceneViewOf(useSceneViews.getState(), 'doc-1').armedWorld).toMatchObject({
      materialChannel: 'g',
    })
  })

  it('assigns a height mask to the armed edit', async () => {
    render(<WorldPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Aucun' }))
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Hauteur' }))

    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer && layer.kind === 'relief' ? layer.edits[0]?.mask : undefined).toEqual({
      kind: 'height',
      min: 0,
      max: 1,
    })
  })
})

describe('WorldTools scatter session', () => {
  beforeEach(() => {
    useSceneViews.setState({ views: {} })
    const scene = createDefaultScene()
    installScene('doc-1', {
      ...scene,
      world: { ...scene.world, layers: [scatterLayer({ id: 'trees' })] },
    })
    useSceneViews.getState().setArmedWorld('doc-1', { kind: 'scatter', id: 'trees' })
  })

  it('arms direct ground painting and writes scatter placement settings', async () => {
    render(<WorldPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Peindre le sol' }))
    await userEvent.click(screen.getByLabelText('Rotation aléatoire'))

    expect(sceneViewOf(useSceneViews.getState(), 'doc-1')).toMatchObject({
      sculptMode: true,
      sculptTool: 'paintGround',
    })
    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer?.kind === 'scatter' ? layer.rules.randomRotation : true).toBe(false)
  })

  it('removes collision controls when the scatter category becomes grass', async () => {
    render(<WorldPanel />)

    expect(screen.getByLabelText('Collision')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Catégorie'), 'grass')

    expect(screen.queryByLabelText('Collision')).not.toBeInTheDocument()
    const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(layer).toMatchObject({ kind: 'scatter', category: 'grass', collision: false })
  })
})

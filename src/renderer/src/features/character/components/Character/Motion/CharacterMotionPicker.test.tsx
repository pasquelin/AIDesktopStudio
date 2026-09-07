import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSET_SEARCH_LIMIT_MAX, type Asset } from '@shared/domain/asset'
import type { ClipSource } from '@shared/domain/scene'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { useModelFiles } from '@/stores/modelFiles'
import { useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { CharacterMotionPicker } from './CharacterMotionPicker'

const conversion = vi.hoisted(() => ({
  arrived: vi.fn(async (assets: readonly Asset[]) => assets),
}))
vi.mock('@/services/meshConversion', () => ({ convertArrivedModels: conversion.arrived }))

const DOCUMENT = 'doc-1'

const bundled = [{ name: 'Capoeira', thumbnail: true }]

const JIG: Asset = {
  id: 'asset-9',
  name: 'jig',
  type: 'animation',
  location: 'local',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
}

function show(laid: { clipId: string; source: ClipSource } | null = null) {
  const onChoose = vi.fn()
  const onKeep = vi.fn()
  const onCancel = vi.fn()

  render(
    <CharacterMotionPicker
      documentId={DOCUMENT}
      nodeId="a"
      anchor={document.body}
      laid={laid}
      onChoose={onChoose}
      onKeep={onKeep}
      onCancel={onCancel}
    />,
  )
  return { onChoose, onKeep, onCancel }
}

beforeEach(() => {
  conversion.arrived.mockImplementation(async assets => assets)
  installFakeBridge({ animations: { list: () => Promise.resolve(bundled) } })
  useAssets.setState({ items: [] })
  useModelFiles.setState({ clips: {}, rigs: {}, lengths: {}, fits: {} })
  useScenes.setState({
    states: { [DOCUMENT]: { ...EMPTY_SCENE, nodes: [modelNodeFixture('a')] } },
    histories: {},
  })
  useSceneViews.setState({ views: {} })
})

describe('choosing an animation', () => {
  it('offers the three sources the issue names', () => {
    show()

    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Bibliothèque',
      'Import',
      'IA',
    ])
  })

  // The character's own clips are offered here too, and a Tripo rig spells its one `NlaTrack`.
  it('offers a clip of the character under a name of the app, not the exporter’s', async () => {
    useModelFiles.setState({ clips: { [DOCUMENT]: { a: ['NlaTrack'] } } })
    const { onChoose } = show()

    await userEvent.click(await screen.findByRole('option', { name: 'Animation' }))

    // The row READS « Animation » and the document keeps « NlaTrack »: a translated word written
    // into a glTF would follow the language the project happened to be created in.
    expect(onChoose).toHaveBeenCalledWith({ kind: 'embedded', name: 'NlaTrack' }, 'NlaTrack')
  })

  it('lists what the app ships with, and hands its source back on a click', async () => {
    const { onChoose } = show()

    await userEvent.click(await screen.findByRole('option', { name: 'Capoeira' }))

    expect(onChoose).toHaveBeenCalledWith({ kind: 'bundled', name: 'Capoeira' }, 'Capoeira')
  })

  // The shelf stays empty on purpose: `useAssets.items` is a SCOPE — paged, narrowed by the space
  // in front and by whatever facet was picked — so a library built out of it lists what has been
  // browsed rather than what the project holds.
  it('lists the motions the project holds beside them', async () => {
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      assets: { search: () => Promise.resolve([JIG]) },
    })
    const { onChoose } = show()

    await userEvent.click(await screen.findByRole('option', { name: 'jig' }))

    expect(onChoose).toHaveBeenCalledWith({ kind: 'asset', assetId: 'asset-9', name: 'jig' }, 'jig')
  })

  it('offers none the catalogue no longer holds, whatever the shelf still remembers', async () => {
    useAssets.setState({ items: [JIG] })
    show()

    expect(await screen.findByRole('option', { name: 'Capoeira' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'jig' })).not.toBeInTheDocument()
  })

  // Without a `limit` the main answers `DEFAULT_LIMIT` — 200, exactly the page the shelf reads by,
  // so a project past that many motions would be truncated with nothing said.
  it('asks the catalogue as wide as it is allowed to answer', async () => {
    const search = vi.fn(() => Promise.resolve([JIG]))
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      assets: { search },
    })
    show()

    await screen.findByRole('option', { name: 'jig' })

    expect(search).toHaveBeenCalledWith({ type: 'animation', limit: ASSET_SEARCH_LIMIT_MAX })
  })

  // Nothing is laid yet, so there is nothing to keep and nothing to look at.
  it('offers neither preview nor decision until something has been chosen', () => {
    show()

    expect(screen.queryByRole('button', { name: 'Garder' })).not.toBeInTheDocument()
  })

  it('offers the two ways out once a block is laid', () => {
    const { onKeep, onCancel } = show({
      clipId: 'block-1',
      source: { kind: 'bundled', name: 'Capoeira' },
    })

    expect(screen.getByRole('button', { name: 'Garder' })).toBeInTheDocument()
    expect(onKeep).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('takes the block back on the only control that means it', async () => {
    const { onKeep, onCancel } = show({
      clipId: 'block-1',
      source: { kind: 'bundled', name: 'Capoeira' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalled()
    expect(onKeep).not.toHaveBeenCalled()
  })

  it('lays the one motion a pick brought in', async () => {
    const motion: Asset = {
      id: 'asset-walk',
      name: 'Walking',
      type: 'animation',
      location: 'local',
      tags: [],
      createdAt: '2026-09-06T00:00:00.000Z',
    }
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      media: {
        importPicked: async () => ({
          assets: [motion],
          documents: [],
          montages: [],
          refused: [],
          failed: [],
        }),
      },
    })
    const { onChoose } = show()

    await userEvent.click(screen.getByRole('tab', { name: 'Import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choisir un fichier…' }))

    await waitFor(() =>
      expect(onChoose).toHaveBeenCalledWith(
        { kind: 'asset', assetId: 'asset-walk', name: 'Walking' },
        'Walking',
      ),
    )
  })

  it('does not lay a block when several motions arrive at once', async () => {
    const motion = (id: string, name: string): Asset => ({
      id,
      name,
      type: 'animation',
      location: 'local',
      tags: [],
      createdAt: '2026-09-06T00:00:00.000Z',
    })
    const importPicked = vi.fn(async () => ({
      assets: [motion('asset-a', 'Walking'), motion('asset-b', 'Start Walking')],
      documents: [],
      montages: [],
      refused: [],
      failed: [],
    }))
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      media: { importPicked },
    })
    const { onChoose } = show()

    await userEvent.click(screen.getByRole('tab', { name: 'Import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choisir un fichier…' }))

    await waitFor(() => expect(importPicked).toHaveBeenCalled())
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('does not choose a file that conversion reclassifies as a model', async () => {
    const filed: Asset = {
      ...JIG,
      path: 'Animations/Jig/animation.fbx',
    }
    conversion.arrived.mockResolvedValue([
      { ...filed, type: 'mesh', path: 'Models/Jig.glb', convertedFrom: 'Models/.sources/Jig.fbx' },
    ])
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      media: {
        importPicked: async () => ({
          assets: [filed],
          documents: [],
          montages: [],
          refused: [],
          failed: [],
        }),
      },
    })
    const { onChoose } = show()

    await userEvent.click(screen.getByRole('tab', { name: 'Import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choisir un fichier…' }))

    await waitFor(() => expect(conversion.arrived).toHaveBeenCalledWith([filed]))
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('does not choose an animation whose required conversion failed', async () => {
    const filed: Asset = { ...JIG, path: 'Animations/Jig.fbx' }
    conversion.arrived.mockResolvedValue([filed])
    installFakeBridge({
      animations: { list: () => Promise.resolve(bundled) },
      media: {
        importPicked: async () => ({
          assets: [filed],
          documents: [],
          montages: [],
          refused: [],
          failed: [],
        }),
      },
    })
    const { onChoose } = show()

    await userEvent.click(screen.getByRole('tab', { name: 'Import' }))
    await userEvent.click(screen.getByRole('button', { name: 'Choisir un fichier…' }))

    await waitFor(() => expect(conversion.arrived).toHaveBeenCalledWith([filed]))
    expect(onChoose).not.toHaveBeenCalled()
  })
})

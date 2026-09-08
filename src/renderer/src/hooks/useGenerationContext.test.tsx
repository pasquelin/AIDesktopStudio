import { act, renderHook, waitFor } from '@testing-library/react'
import type { Asset } from '@shared/domain/asset'
import { beforeEach, describe, expect, it } from 'vitest'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installDocuments } from '@/stores/document-fixtures'
import { installScene } from '@/stores/scene-fixtures'
import { useLayouts } from '@/stores/layouts'
import { sceneOf, useScenes } from '@/stores/scenes'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import type { GenerationInput } from '@/generation/generationInputs'
import { useGenerationContext } from './useGenerationContext'
import { installCanvas } from '@/stores/canvas-fixtures'
import { useGenerationComments } from '@/stores/generationComments'
import { aiRoleId } from '@shared/domain/aiRole'

const DOCUMENT = 'doc-3d'

/** Two placements of one model, so the id of the ROW cannot stand in for either of them. */
function twoPlacements(): void {
  installScene(DOCUMENT, {
    ...EMPTY_SCENE,
    nodes: [modelNodeFixture('node-a', 'asset-robot'), modelNodeFixture('node-b', 'asset-robot')],
    selectedIds: ['node-a', 'node-b'],
  })
  installDocuments({ [DOCUMENT]: '3d' }, DOCUMENT)
  useLayouts.setState({ activeWorkspace: '3d' })
}

const scenes = (
  inputs: readonly GenerationInput[],
): Extract<GenerationInput, { origin: 'scene' }>[] =>
  inputs.flatMap(input => (input.origin === 'scene' ? [input] : []))

const files = (
  inputs: readonly GenerationInput[],
): Extract<GenerationInput, { origin: 'explorer' }>[] =>
  inputs.flatMap(input => (input.origin === 'explorer' ? [input] : []))

const PICTURE_PATH = 'Images/concept.png'

/** The catalogue row a picked path resolves to — what the panel asks the catalogue for. */
const PICTURE: Asset = {
  id: 'asset-picture',
  name: 'concept',
  type: 'image',
  location: 'local',
  path: PICTURE_PATH,
  tags: [],
  createdAt: '2026-08-25T10:00:00.000Z',
}

/** The catalogue answers by PATH, which is the question `assetsAt` puts to it. */
const catalogueHolding = (assets: readonly Asset[]): void => {
  installFakeBridge({ assets: { search: async () => [...assets] } })
}

// The document stores are emptied by the setup, for every case of every suite.
beforeEach(() => {
  useSelection.getState().selectFiles([])
  useAssets.setState({ items: [PICTURE] })
  catalogueHolding([PICTURE])
  useGenerationComments.setState({ comments: {} })
})

describe('an annotated image document', () => {
  it('selects image-to-image without manufacturing an asset row', () => {
    installCanvas('image-1')
    useLayouts.setState({ activeWorkspace: 'image' })
    useGenerationComments.getState().add('image-1', {
      id: 'note-1',
      at: { x: 10, y: 20 },
      text: 'Keep the subject',
    })

    const { result } = renderHook(() => useGenerationContext(null))

    expect(result.current.capability.chosen).toBe(aiRoleId('image', 'img2img'))
    expect(result.current.inputs).toEqual([])
  })
})

describe('taking a source back off', () => {
  /**
   * 🛑 The placement, never the row. Two nodes referencing one model are two sources, so
   * deselecting by asset id would take both off at once — and the shelf's own pick with them,
   * back when this went through the global selection.
   */
  it('deselects the very placement a scene source was picked as', () => {
    twoPlacements()
    const { result } = renderHook(() => useGenerationContext(null))

    // Two rows for one model, and that is the point: each placement is its own source.
    expect(result.current.inputs).toHaveLength(2)

    const first = scenes(result.current.inputs).find(input => input.nodeId === 'node-a')
    act(() => result.current.withdraw(first!))

    expect(sceneOf(useScenes.getState(), DOCUMENT).selectedIds).toEqual(['node-b'])
  })

  // The explorer keeps what it had: the two selections used to share one descriptor, so
  // withdrawing a mesh wiped every file source beside it.
  it('leaves what the explorer had picked alone', () => {
    twoPlacements()
    useSelection.getState().selectFiles([PICTURE_PATH])
    const { result } = renderHook(() => useGenerationContext(null))

    act(() => result.current.withdraw(scenes(result.current.inputs)[0]!))

    expect(selectedFilePaths(useSelection.getState())).toEqual([PICTURE.path])
  })

  // By the PATH, which is what the explorer deselects by: the asset id names the catalogue row,
  // and handing it back to a panel keyed on paths takes nothing off.
  it('deselects the file an explorer source was picked as', async () => {
    useSelection.getState().selectFiles([PICTURE_PATH, 'Images/other.png'])
    const { result } = renderHook(() => useGenerationContext(null))
    await waitFor(() => expect(result.current.inputs).toHaveLength(1))

    act(() => result.current.withdraw(files(result.current.inputs)[0]!))

    expect(selectedFilePaths(useSelection.getState())).toEqual(['Images/other.png'])
  })
})

describe('what the explorer offers', () => {
  /**
   * 🛑 Asked OF the catalogue, so a project past the shelf's first page of two hundred still
   * answers. The FILE's name stands under the thumbnail — a row is filed under its stem, and the
   * explorer this was picked in shows the extension.
   */
  it('resolves a picked path against the catalogue, under the name the explorer shows', async () => {
    useSelection.getState().selectFiles([PICTURE_PATH])

    const { result } = renderHook(() => useGenerationContext(null))

    await waitFor(() =>
      expect(result.current.inputs).toMatchObject([
        { assetId: PICTURE.id, label: 'concept.png', origin: 'explorer', path: PICTURE_PATH },
      ]),
    )
  })

  /**
   * 🛑 What is already resolved STAYS while the next question is in flight. Emptied on the way,
   * every pick left the panel with no source for a frame: the operation fell back to
   * text-to-image, the model swapped, and the form cleared the picture it was working from.
   */
  it('keeps the sources it has while a newly picked file is being resolved', async () => {
    const second: Asset = { ...PICTURE, id: 'asset-second', path: 'Images/second.png' }
    useSelection.getState().selectFiles([PICTURE_PATH])
    const { result, rerender } = renderHook(() => useGenerationContext(null))
    await waitFor(() => expect(result.current.inputs).toHaveLength(1))

    catalogueHolding([PICTURE, second])
    act(() => useSelection.getState().selectFiles([PICTURE_PATH, second.path!]))
    rerender()

    // The render the second pick commits: the first source is still there, not blanked.
    expect(files(result.current.inputs).map(input => input.path)).toContain(PICTURE_PATH)
    await waitFor(() => expect(result.current.inputs).toHaveLength(2))
  })

  /**
   * 🛑 A source with no catalogue row is one the panel would draw and never send: `assetId` is
   * required, and this window has no upload of its own. Silently skipped, as a scene skips every
   * node that is not a model.
   */
  it('offers nothing for a file the catalogue does not hold', async () => {
    catalogueHolding([])
    useSelection.getState().selectFiles(['Images/never-indexed.png'])

    const { result } = renderHook(() => useGenerationContext(null))

    await waitFor(() => expect(result.current.inputs).toEqual([]))
  })
})

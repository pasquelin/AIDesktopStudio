import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
// The expected words come from the French bundle rather than being spelt out, which is what keeps
// a renamed slot from leaving this case asserting a label the panel no longer draws.
import { addAnimationTrack } from '@/engines/scene/animationCommands'
import {
  cameraNodeFixture,
  lightNodeFixture,
  meshNode,
  spriteNodeFixture,
} from '@/engines/scene/scene-fixtures'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAnimationViews } from '@/stores/animationView'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useSettings } from '@/stores/settings'
import { installScene, sceneNodeNow } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { definition } from '../../shell/tools/inspector'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { withQueries } from '@/features/shell/components/query-fixtures'

const { Content } = definition

function install(node: SceneNode, selected = true): SceneState {
  const state: SceneState = {
    ...EMPTY_SCENE,
    nodes: [node],
    selectedIds: selected ? [node.id] : [],
  }
  installScene('doc-1', state)
  return state
}

const nodeInStore = (id: string): SceneNode | null => sceneNodeNow('doc-1', id)

/**
 * What the CATALOGUE holds — which is what a texture slot now asks, rather than the shelf.
 *
 * `useAssets.items` is the browser's scope: in the 3D space it is narrowed to meshes, so every
 * slot of the inspector offered nothing there. The shelf is filled too, because `openAssetById`
 * still resolves an id through it.
 */
function cataloguing(assets: readonly Asset[]): void {
  useAssets.setState({ items: assets })
  installFakeBridge({ assets: { search: () => Promise.resolve([...assets]) } })
}

/** A sky the catalogue answers with — the only kind the environment slot takes. */
function skyAsset(id: string, name: string): Asset {
  return {
    id,
    name,
    type: 'skybox',
    location: 'local',
    path: `assets/${id}.png`,
    tags: [],
    createdAt: '2026-08-08T00:00:00.000Z',
  }
}

/** The source row, once the catalogue has answered — the slot lists nothing until it has. */
async function skySource(): Promise<HTMLElement> {
  await waitFor(() =>
    expect(within(screen.getByLabelText('Ciel')).getAllByRole('option').length).toBeGreaterThan(1),
  )
  return screen.getByRole('combobox', { name: 'Source' })
}

beforeEach(() => {
  install(meshNode('box-1'))
  // The preferences are a module-wide store: a case that writes one — the display unit — would
  // otherwise leave every case after it reading lengths in millimetres.
  useSettings.setState({ settings: DEFAULT_SETTINGS })
})

describe('inspector panel', () => {
  it('asks for a selection when no document can offer one', () => {
    useDocuments.setState({ activeId: null })
    render(withQueries(<Content />))

    expect(screen.getByText(/Sélectionnez un élément/)).toBeInTheDocument()
  })

  // The environment belongs to the document rather than to a node, so it is what the panel shows
  // when nothing is selected — in place of a message saying there is nothing to show.
  it('shows what lights the scene when nothing is selected', () => {
    install(meshNode('box-1'), false)
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Environnement/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Transformation/ })).not.toBeInTheDocument()
  })

  // The slot is what a sky is DRAGGED onto, and a fresh scene opens on the studio: hiding it
  // there would leave the 3D space with no drop target for a sky at all.
  it('keeps the sky slot whatever the source, so a sky can always be dropped', () => {
    render(withQueries(<Content />))

    expect(screen.getByLabelText('Ciel')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveValue('studio')
  })

  // The row asks « lit by a sky », and an answer that lights nothing until a second gesture is
  // not one: the first sky of the project lands, and the slot below is what changes it.
  it('writes a sky into the document as soon as one is asked for, through the history', async () => {
    cataloguing([skyAsset('sky-1', 'Coucher')])
    render(withQueries(<Content />))

    await userEvent.selectOptions(await skySource(), 'skybox')

    expect(sceneOf(useScenes.getState(), 'doc-1').world.environment).toEqual({
      kind: 'skybox',
      assetId: 'sky-1',
    })

    useScenes.getState().undo('doc-1')
    expect(sceneOf(useScenes.getState(), 'doc-1').world.environment).toEqual({ kind: 'studio' })
  })

  it('offers the skies of the project in the slot, and the studio to come back to', async () => {
    cataloguing([skyAsset('sky-1', 'Coucher'), skyAsset('sky-2', 'Aube')])
    render(withQueries(<Content />))
    await userEvent.selectOptions(await skySource(), 'skybox')

    const slot = screen.getByLabelText('Ciel')
    await userEvent.selectOptions(slot, 'sky-2')

    expect(sceneOf(useScenes.getState(), 'doc-1').world.environment).toEqual({
      kind: 'skybox',
      assetId: 'sky-2',
    })
    expect(within(slot).getByRole('option', { name: 'Studio' })).toBeInTheDocument()
  })

  it('shows the three sections of a mesh', () => {
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Transformation/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Géométrie/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Matière/ })).toBeInTheDocument()
  })

  it('shows a light its own section, and no geometry', () => {
    install(
      lightNodeFixture('light-1', {
        kind: 'point',
        color: '#ffffff',
        intensity: 1,
        distance: 0,
        decay: 2,
      }),
    )
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Lumière/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Géométrie/ })).not.toBeInTheDocument()
    // A light is placed like anything else: the transform is not a mesh privilege.
    expect(screen.getByRole('button', { name: /Transformation/ })).toBeInTheDocument()
  })

  it('shows a camera its lens, and no material', () => {
    install(cameraNodeFixture('camera-1'))
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Caméra/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Matière/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Transformation/ })).toBeInTheDocument()
  })

  /**
   * The lens is the one property no gizmo can carry, so the inspector is where a camera is
   * animated from — and where the whole of `fov` in `TrackProperty` would otherwise be
   * unreachable: a channel opened by the sheet held nothing but zeroes.
   */
  it('keys the field of view while auto-key records, rather than moving the lens itself', () => {
    const state = install(cameraNodeFixture('camera-1', { fov: 50 }))
    installScene(
      'doc-1',
      addAnimationTrack({ nodeId: 'camera-1', property: 'fov' }, 'Lens', 'lens').apply(state),
    )
    useAnimationViews.getState().setAutoKey('doc-1', true)
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Angle de vue'), { target: { value: '80' } })

    const node = nodeInStore('camera-1')
    expect(node?.type === 'camera' && node.camera.fov).toBe(50)
    expect(sceneOf(useScenes.getState(), 'doc-1').animation.tracks[0]?.keys).toEqual([
      { time: 0, value: { x: 30, y: 0, z: 0 } },
    ])
    // What the field reads back is what was typed: the descriptor plus what the channel adds.
    expect(screen.getByLabelText('Angle de vue')).toHaveValue('80')
  })

  it('writes the lens itself for a camera nothing animates', () => {
    install(cameraNodeFixture('camera-1', { fov: 50 }))
    render(withQueries(<Content />))

    fireEvent.change(screen.getByLabelText('Angle de vue'), { target: { value: '80' } })

    const node = nodeInStore('camera-1')
    expect(node?.type === 'camera' && node.camera.fov).toBe(80)
  })

  it('shows a sprite its own section, and no material', () => {
    install(spriteNodeFixture('sprite-1'))
    render(withQueries(<Content />))

    expect(screen.getByRole('button', { name: /Sprite/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Matière/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Transformation/ })).toBeInTheDocument()
  })

  // three.js draws meshes into a shadow map and nothing else: both switches would be inert.
  it('offers a sprite no shadow section at all', () => {
    install(spriteNodeFixture('sprite-1'))
    render(withQueries(<Content />))

    expect(screen.queryByRole('button', { name: /Ombres/ })).not.toBeInTheDocument()
  })

  /**
   * The viewport already refused the handle over a lone sprite; the row went on taking an angle
   * nothing draws, which stacked an undo for a screen that never moved.
   *
   * INERT rather than absent since 2026-08-19: the panel keeps its shape from one node to the
   * next, so an attribute is found where it was last seen instead of the rows below it shifting
   * up. The three axes are refused together, and the row says why on hover.
   */
})

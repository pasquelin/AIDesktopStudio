import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset, AssetType } from '@shared/domain/asset'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { TEXTURE_SLOTS } from '@shared/domain/scene'
// The expected words come from the French bundle rather than being spelt out, which is what keeps
// a renamed slot from leaving this case asserting a label the panel no longer draws.
import { fr } from '@shared/i18n/fr'
import { createNodeOf } from '@/engines/scene/nodeFactory'
import { lightNodeFixture, meshNode } from '@/engines/scene/scene-fixtures'
import { DEFAULT_MATERIAL, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { useSettings } from '@/stores/settings'
import { installScene, sceneNodeNow } from '@/stores/scene-fixtures'
import { sceneHistoryOf, useScenes } from '@/stores/scenes'
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

const entries = () => sceneHistoryOf(useScenes.getState(), 'doc-1').past.length

/** The drag handle of one axis. Throws rather than narrowing, so a miss reads as a miss. */
function axisHandle(axis: string, occurrence = 0): HTMLElement {
  const handles = screen.getAllByText(axis)
  const handle = handles.at(occurrence)
  if (!handle) throw new Error(`no ${axis} handle at ${occurrence}`)
  return handle
}

beforeEach(() => {
  install(meshNode('box-1'))
  // The preferences are a module-wide store: a case that writes one — the display unit — would
  // otherwise leave every case after it reading lengths in millimetres.
  useSettings.setState({ settings: DEFAULT_SETTINGS })
})

describe('inspector panel', () => {
  describe('editing a mesh', () => {
    it('writes a typed geometry parameter into the state', async () => {
      render(withQueries(<Content />))

      const width = screen.getByLabelText('Largeur')
      await userEvent.clear(width)
      await userEvent.type(width, '4')

      const node = nodeInStore('box-1')
      expect(node?.type === 'mesh' && node.geometry).toMatchObject({ kind: 'box', width: 4 })
    })

    it('leaves the rest of the geometry alone', async () => {
      render(withQueries(<Content />))

      await userEvent.clear(screen.getByLabelText('Hauteur'))
      await userEvent.type(screen.getByLabelText('Hauteur'), '3')

      const node = nodeInStore('box-1')
      expect(node?.type === 'mesh' && node.geometry).toEqual({
        kind: 'box',
        width: 1,
        height: 3,
        depth: 1,
      })
    })

    it('writes a material colour', () => {
      render(withQueries(<Content />))

      fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#ff0000' } })

      const node = nodeInStore('box-1')
      expect(node?.type === 'mesh' && node.material.color).toBe('#ff0000')
    })

    it('moves the node it was handed', () => {
      render(withQueries(<Content />))
      const handle = axisHandle('X')

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20 })

      expect(nodeInStore('box-1')?.transform.position.x).toBe(2)
    })

    // Radians are what the document stores; nobody types in them.
    it('turns the node in degrees', () => {
      render(withQueries(<Content />))
      const handle = axisHandle('Y', 1)

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 90 })

      expect(nodeInStore('box-1')?.transform.rotation.y).toBeCloseTo(Math.PI / 2)
    })
  })

  describe('editing a light', () => {
    beforeEach(() => {
      install(
        lightNodeFixture('light-1', {
          kind: 'spot',
          color: '#ffffff',
          intensity: 1,
          distance: 0,
          angle: 0.3,
          penumbra: 0,
          decay: 2,
          target: { x: 0, y: 0, z: 0 },
        }),
      )
    })

    it('slides the intensity', () => {
      render(withQueries(<Content />))

      fireEvent.change(screen.getByLabelText('Intensité'), { target: { value: '3.5' } })

      const node = nodeInStore('light-1')
      expect(node?.type === 'light' && node.light.intensity).toBe(3.5)
    })

    it('moves the target of the beam', () => {
      render(withQueries(<Content />))
      const handle = axisHandle('Z', -1)

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10 })

      const node = nodeInStore('light-1')
      expect(node?.type === 'light' && node.light.kind === 'spot' && node.light.target.z).toBe(1)
    })
  })

  describe('history', () => {
    it('leaves one entry for a whole drag, and undo gives the node back', () => {
      render(withQueries(<Content />))
      const handle = axisHandle('X')

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 30 })
      fireEvent.pointerUp(handle, { pointerId: 1 })

      expect(entries()).toBe(1)

      useScenes.getState().undo('doc-1')
      expect(nodeInStore('box-1')?.transform.position.x).toBe(0)
    })

    it('makes a typing session one entry', async () => {
      render(withQueries(<Content />))

      const width = screen.getByLabelText('Largeur')
      await userEvent.click(width)
      await userEvent.clear(width)
      await userEvent.type(width, '12')
      await userEvent.tab()

      expect(entries()).toBe(1)
    })

    it('keeps two separate drags apart', () => {
      render(withQueries(<Content />))
      const handle = axisHandle('X')

      for (const distance of [10, 20]) {
        fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: distance })
        fireEvent.pointerUp(handle, { pointerId: 1 })
      }

      expect(entries()).toBe(2)
    })
  })

  // The panel is derived from the descriptor: a primitive that shows no field would be a
  // primitive nobody can edit, and adding one must never mean writing a form.
  it('offers the parameters of every primitive without a component of its own', () => {
    const knot = createNodeOf('torusKnot')
    if (!knot) throw new Error('no torusKnot builder')
    install(knot)

    render(withQueries(<Content />))

    expect(screen.getByLabelText('Rayon')).toBeInTheDocument()
    expect(screen.getByLabelText('Enroulements P')).toBeInTheDocument()
    expect(screen.getByLabelText('Segments tubulaires')).toBeInTheDocument()
  })

  describe('textures', () => {
    const asset = (id: string, name: string, type: AssetType): Asset => ({
      id,
      name,
      type,
      location: 'local',
      path: `assets/${id}.png`,
      tags: [],
      createdAt: '2026-08-07T00:00:00.000Z',
    })

    beforeEach(() => {
      cataloguing([
        asset('tex-1', 'Brique', 'image'),
        asset('img-1', 'Rendu', 'image'),
        asset('vid-1', 'Rush', 'video'),
      ])
    })

    // What the studio generates lands in `image` far more often than in `texture`.
    it('offers the pictures of the project, whatever folder they were filed under', async () => {
      render(withQueries(<Content />))

      expect(await screen.findAllByRole('option', { name: /Brique/ })).not.toHaveLength(0)
      expect(screen.getAllByRole('option', { name: /Rendu/ })).not.toHaveLength(0)
    })

    /**
     * The defect this closes, reported from the 3D space: the slots built their list out of
     * `useAssets.items`, which is the BROWSER's scope — narrowed to meshes there — so « swap a
     * map » offered nothing at all and refused every click, in the one space it belongs to.
     */
    it('offers them while the shelf is narrowed to another kind entirely', async () => {
      useAssets.setState({ items: [] })
      render(withQueries(<Content />))

      expect(await screen.findAllByRole('option', { name: /Brique/ })).not.toHaveLength(0)
    })

    it('leaves out what could never be loaded into a channel', async () => {
      render(withQueries(<Content />))
      await screen.findAllByRole('option', { name: /Brique/ })

      expect(screen.queryByRole('option', { name: /Rush/ })).not.toBeInTheDocument()
    })

    // A channel is a reference to an asset, never pixels: that is what a reopened scene can
    // resolve again.
    it('stores the asset identifier in the material', async () => {
      render(withQueries(<Content />))
      await screen.findAllByRole('option', { name: /Brique/ })

      await userEvent.selectOptions(screen.getByLabelText('Couleur de base'), 'tex-1')

      const node = nodeInStore('box-1')
      expect(node?.type === 'mesh' && node.material.map).toEqual({ assetId: 'tex-1' })
    })

    it('empties the slot it is asked to clear, and undo puts it back', async () => {
      install({
        ...meshNode('box-1'),
        material: { ...DEFAULT_MATERIAL, map: { assetId: 'tex-1' } },
      })
      render(withQueries(<Content />))

      await userEvent.click(screen.getAllByRole('button', { name: /Retirer l’image/ })[0]!)

      const cleared = nodeInStore('box-1')
      expect(cleared?.type === 'mesh' && cleared.material.map).toBeNull()

      useScenes.getState().undo('doc-1')
      const back = nodeInStore('box-1')
      expect(back?.type === 'mesh' && back.material.map).toEqual({ assetId: 'tex-1' })
    })

    /**
     * One list per map, each named after the map it fills — which is what tells five stacked
     * slots apart, for a reader stepping through them or a voice command naming the one on
     * screen. The name is now the label of the shared column, like every other property line.
     */
    it('offers a slot per map a standard material reads, each under its own name', () => {
      render(withQueries(<Content />))

      const named = TEXTURE_SLOTS.map(slot =>
        screen.getByLabelText(fr.inspector.fields[slot], { exact: true }),
      )

      expect(new Set(named).size).toBe(TEXTURE_SLOTS.length)
    })
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { DEFAULT_WORLD } from '@shared/domain/scene'
// The expected words come from the French bundle rather than being spelt out, which is what keeps
// a renamed slot from leaving this case asserting a label the panel no longer draws.
import { addNode } from '@/engines/scene/commands'
import { createNodeOf } from '@/engines/scene/nodeFactory'
import { lightNodeFixture, meshNode } from '@/engines/scene/scene-fixtures'
import { IDENTITY_TRANSFORM, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import type { Transform } from '@shared/domain/scene'
import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { installCanvas } from '@/stores/canvas-fixtures'
import { clipFixture } from '@/engines/timeline/timeline-fixtures'
import { EMPTY_SOUND_SEQUENCE, SECOND } from '@/engines/timeline/timelineState'
import { useSequences } from '@/stores/sequences'
import { installDocument } from '@/stores/document-fixtures'
import { useSelection } from '@/stores/selection'
import { useSettings } from '@/stores/settings'
import { installScene, sceneNodeNow } from '@/stores/scene-fixtures'
import { installMaterial } from '@/stores/material-fixtures'
import { inSection } from './inspector-fixtures'
import { useMaterialViews } from '@/stores/materialViews'
import { materialOf, useMaterials } from '@/stores/materials'
import { setChannel } from '@/engines/material/commands'
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

function moved(x: number, y: number, z: number): Transform {
  return { ...IDENTITY_TRANSFORM, position: { x, y, z } }
}

function turned(x: number, y: number, z: number): Transform {
  return { ...IDENTITY_TRANSFORM, rotation: { x, y, z } }
}

const nodeInStore = (id: string): SceneNode | null => sceneNodeNow('doc-1', id)

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
  it('shows the node name, and renames it', async () => {
    render(withQueries(<Content />))

    const name = screen.getByLabelText('Nom')
    expect(name).toHaveValue('box-1')

    await userEvent.clear(name)
    await userEvent.type(name, 'Socle')

    expect(nodeInStore('box-1')?.name).toBe('Socle')
  })

  // The anchor is what the fields read out; what they write to is the whole selection.
  describe('several nodes at once', () => {
    function installPair(): void {
      installScene('doc-1', {
        ...EMPTY_SCENE,
        nodes: [meshNode('box-1'), meshNode('box-2'), lightNodeFixture('light-1')],
        selectedIds: ['box-2', 'box-1'],
      })
    }

    it('reads out the anchor, which is the last node picked', () => {
      installPair()
      render(withQueries(<Content />))

      expect(screen.getByLabelText('Nom')).toHaveValue('box-1')
    })

    /**
     * A length is shown in the display unit and stored in metres, and the round trip through
     * millimetres is not exact — about one double in forty comes back differing in its last bit.
     * Compared AFTER the conversion, those untouched axes read as changed and were written onto
     * the whole selection: three cubes given a height collapsed onto one column.
     */
    it('moves only the axis typed, whatever unit the lengths are written in', async () => {
      useSettings.setState({
        settings: { ...DEFAULT_SETTINGS, three: { ...DEFAULT_SETTINGS.three, units: 'mm' } },
      })
      // An X whose millimetre round trip is NOT exact: any value that survives it would pass.
      installScene('doc-1', {
        ...EMPTY_SCENE,
        nodes: [
          { ...meshNode('box-1'), transform: moved(6.246671654299291, 0, 0) },
          { ...meshNode('box-2'), transform: moved(5, 0, 0) },
        ],
        selectedIds: ['box-2', 'box-1'],
      })
      render(withQueries(<Content />))

      // The first of the three Y fields: position, then rotation, then scale, in that order.
      const y = screen.getAllByLabelText('Y')[0]
      if (!y) throw new Error('no position field')
      await userEvent.clear(y)
      await userEvent.type(y, '200')
      await userEvent.tab()

      // Both took the height; neither took the anchor's X.
      expect(nodeInStore('box-1')?.transform.position).toMatchObject({ y: 0.2 })
      expect(nodeInStore('box-2')?.transform.position).toMatchObject({ x: 5, y: 0.2 })
    })

    it('writes a typed geometry parameter onto every selected mesh, as one entry', async () => {
      installPair()
      render(withQueries(<Content />))

      const width = screen.getByLabelText('Largeur')
      await userEvent.clear(width)
      await userEvent.type(width, '4')
      await userEvent.tab()

      for (const id of ['box-1', 'box-2']) {
        const node = nodeInStore(id)
        expect(node?.type === 'mesh' && node.geometry).toMatchObject({ width: 4 })
      }
      expect(entries()).toBe(1)

      useScenes.getState().undo('doc-1')
      const back = nodeInStore('box-2')
      expect(back?.type === 'mesh' && back.geometry).toMatchObject({ width: 1 })
    })

    it('writes only the axis it was given, so the others keep their own values', () => {
      installScene('doc-1', {
        nodes: [
          { ...meshNode('box-1'), transform: moved(1, 0, 0) },
          { ...meshNode('box-2'), transform: moved(5, 0, 0) },
        ],
        selectedIds: ['box-2', 'box-1'],
        world: DEFAULT_WORLD,
        animation: EMPTY_TIMELINE,
      })
      render(withQueries(<Content />))
      const handle = axisHandle('Y')

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20 })

      expect(nodeInStore('box-1')?.transform.position).toMatchObject({ x: 1, y: 2 })
      expect(nodeInStore('box-2')?.transform.position).toMatchObject({ x: 5, y: 2 })
    })

    // A sphere and a box share no width, and writing one into the other changes a shape nobody
    // looked at.
    it('leaves a node of another kind alone', () => {
      installPair()
      render(withQueries(<Content />))

      fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#ff0000' } })

      const light = nodeInStore('light-1')
      expect(light?.type).toBe('light')
      const other = nodeInStore('box-2')
      expect(other?.type === 'mesh' && other.material.color).toBe('#ff0000')
    })

    // The field reports degrees and the document stores radians; diffing after the conversion
    // back declared untouched axes moved, and wrote the anchor's own angle onto everyone else.
    it('turns one axis without carrying the anchor over the others', () => {
      installScene('doc-1', {
        nodes: [
          { ...meshNode('box-1'), transform: turned(0.1, 0, 0) },
          { ...meshNode('box-2'), transform: turned(1.5, 0, 0) },
        ],
        selectedIds: ['box-2', 'box-1'],
        world: DEFAULT_WORLD,
        animation: EMPTY_TIMELINE,
      })
      render(withQueries(<Content />))
      const handle = axisHandle('Y', 1)

      fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 0 })
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 90 })

      expect(nodeInStore('box-1')?.transform.rotation.x).toBeCloseTo(0.1)
      expect(nodeInStore('box-2')?.transform.rotation.x).toBeCloseTo(1.5)
      expect(nodeInStore('box-2')?.transform.rotation.y).toBeCloseTo(Math.PI / 2)
    })

    it('renames the anchor only: three nodes of one name is not a rename', async () => {
      installPair()
      render(withQueries(<Content />))

      const name = screen.getByLabelText('Nom')
      await userEvent.clear(name)
      await userEvent.type(name, 'Socle')

      expect(nodeInStore('box-1')?.name).toBe('Socle')
      expect(nodeInStore('box-2')?.name).toBe('box-2')
    })
  })

  it('adds nothing to the history for a node added elsewhere', () => {
    const cube = createNodeOf('box')
    if (cube) useScenes.getState().runCommand('doc-1', addNode(cube))
    render(withQueries(<Content />))

    expect(entries()).toBe(1)
  })

  // One panel for the whole studio: an image in front describes its ARMED layer where a clip
  // would be described. What arms it is the stack, never a pointer posted elsewhere.
  it('describes the armed layer of the image in front', () => {
    installCanvas('doc-1')
    render(withQueries(<Content />))

    expect(screen.getByText('Composition')).toBeInTheDocument()
  })

  /**
   * The Audio workspace shows a montage too, and it lives in the same store. Reading only the
   * SEQUENCE in front left every clip and track picked there with an empty inspector: gain,
   * speed and fades of a sound clip were editable from nowhere at all.
   */
  it('describes a clip picked in a sound montage', () => {
    installDocument('doc-1', 'audio')
    useSequences.getState().replace('doc-1', {
      ...EMPTY_SOUND_SEQUENCE,
      tracks: [
        { ...EMPTY_SOUND_SEQUENCE.tracks[0]!, clips: [clipFixture('clip-1', 0, SECOND)] },
        ...EMPTY_SOUND_SEQUENCE.tracks.slice(1),
      ],
      selectedId: 'clip-1',
    })
    render(withQueries(<Content />))

    // A folding heading like every other section of the studio, since the fixed one was merged
    // into it: the Audio space used to be one of the four that could not fold anything.
    expect(screen.getByRole('button', { name: /Clip/ })).toBeInTheDocument()
    // The three a sound clip is shaped by, and the reason this matters: they had no other surface.
    expect(screen.getByRole('spinbutton', { name: /Gain/ })).toBeInTheDocument()
  })

  /**
   * A texture has nothing to select: the material IS the document, so its face shows on the same
   * default branch a scene does — and nothing has to be clicked first.
   */
  describe('the document in front, when nothing was picked', () => {
    // Cleared on purpose: the suite above points the selection at a layer, and a face chosen by
    // `selection.kind` would answer that instead of the document this describes.
    beforeEach(() => {
      useSelection.getState().selectFiles([])
    })

    it('describes the material of a texture', () => {
      installMaterial('doc-1')
      render(withQueries(<Content />))

      expect(inSection('Matière').getByLabelText('Rugosité')).toBeInTheDocument()
    })

    /** The section folds, and a folded one keeps no field mounted — see `PropertySection`. */
    const openTiling = () => userEvent.click(screen.getByRole('button', { name: /^Répétition$/ }))

    /**
     * The preview multiplier and the seam shift live under the values they act on, and neither
     * ever reaches a scene: written into `material.tiling`, a glance would go out with the file.
     */
    it('multiplies the repeat for the preview without writing it into the material', async () => {
      installMaterial('doc-1')
      render(withQueries(<Content />))
      await openTiling()

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Aperçu de la répétition' }),
        '4',
      )

      const texture = materialOf(useMaterials.getState(), 'doc-1')
      expect(texture.preview.tilingPreview).toBe(4)
      expect(texture.material.tiling).toEqual({ x: 1, y: 1 })
    })

    it('brings the seams to the middle without writing an offset into the material', async () => {
      installMaterial('doc-1')
      render(withQueries(<Content />))
      await openTiling()

      await userEvent.click(screen.getByLabelText('Amener les coutures au centre'))

      const texture = materialOf(useMaterials.getState(), 'doc-1')
      expect(texture.preview.showSeam).toBe(true)
      expect(texture.material.offset).toEqual({ x: 0, y: 0 })
    })

    /** A measurement asks the GPU for a context: it is offered where there is nothing to read. */
    it('refuses to measure a seam with no base colour to measure it on', async () => {
      installMaterial('doc-1')
      render(withQueries(<Content />))
      await openTiling()

      expect(screen.getByRole('button', { name: 'Mesurer' })).toBeDisabled()
    })

    it('offers the measurement once a base colour is there', async () => {
      installMaterial('doc-1')
      useMaterials
        .getState()
        .runCommand(
          'doc-1',
          setChannel('baseColor', { assetId: 'img-1', origin: 'imported', width: 8, height: 8 }),
        )
      render(withQueries(<Content />))
      await openTiling()

      expect(screen.getByRole('button', { name: 'Mesurer' })).toBeEnabled()
    })

    /** The base colour a reading was taken off, so the words on screen can be checked against it. */
    const measured = (assetId: string, ratio: number) => {
      installMaterial('doc-1')
      useMaterials
        .getState()
        .runCommand(
          'doc-1',
          setChannel('baseColor', { assetId, origin: 'imported', width: 8, height: 8 }),
        )
      useMaterialViews.setState({ seams: { 'doc-1': { assetId: 'img-1', ratio } } })
    }

    it('reads a measurement back in words rather than as a ratio', async () => {
      measured('img-1', 3)
      render(withQueries(<Content />))
      await openTiling()

      expect(screen.getByText('Couture visible')).toBeInTheDocument()
    })

    /**
     * A reading describes one picture. Left on screen after the base colour was replaced, it
     * says "Visible seam" about pixels the document no longer points at.
     */
    it('drops the words when the base colour they described is gone', async () => {
      measured('img-2', 3)
      render(withQueries(<Content />))
      await openTiling()

      expect(screen.queryByText('Couture visible')).not.toBeInTheDocument()
    })

    /**
     * Not a matter of precedence: `activeIdOfKind` answers for one kind, so a document is a scene
     * or a texture and never both. What this pins is that adding the second face left the first
     * one answering — the same branch now has two ways out.
     */
    it('shows the scene face for a 3D document, not the texture one', () => {
      install(meshNode('mesh-1'), false)
      render(withQueries(<Content />))

      // `Rugosité` belongs to the material of a texture; a mesh material says `Rugosité` nowhere.
      expect(screen.queryByLabelText('Rugosité')).toBeNull()
      expect(screen.getByRole('button', { name: /Environnement/ })).toBeInTheDocument()
    })

    /** An image opens with a layer armed, so there is always one to describe — see above. */
    it('describes the armed layer when the document in front is an image', () => {
      installCanvas('doc-1')
      render(withQueries(<Content />))

      expect(screen.queryByText('Sélectionnez un élément pour voir ses propriétés.')).toBeNull()
      expect(screen.queryByLabelText('Rugosité')).toBeNull()
    })
  })
})

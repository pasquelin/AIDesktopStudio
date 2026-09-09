import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { Rig } from '@shared/domain/rig'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { withQueries } from '@/features/shell/components/query-fixtures'
import { installFakeBridge } from '@/services/fakeBridge'
import { characterOf, seedCharacter, useCharacters } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { CharacterInspector } from './CharacterInspector'
import { workshopIdOf } from '@shared/domain/character'
import { workshopScene } from '@/character/characterStage'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useModelFiles } from '@/stores/modelFiles'
import { rigStateFixture } from '@/engines/scene/scene-fixtures'
import type { ModelPart } from '@/engines/scene/modelTextures'
import { useAssets } from '@/stores/assets'

const openModelMaterial = vi.hoisted(() => vi.fn<() => Promise<string | null>>())
const reportFailure = vi.hoisted(() => vi.fn())

vi.mock('@/features/material/openModelMaterial', () => ({ openModelMaterial }))
vi.mock('@/services/diagnostics', () => ({ reportFailure }))

const ASSET = 'asset-hero'
const LOCAL_MODEL: Asset = {
  id: ASSET,
  name: 'Hero',
  type: 'mesh',
  location: 'local',
  tags: [],
  createdAt: '2026-09-04T00:00:00.000Z',
}
const SAMPLE = {
  bounds: { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.8, z: 0.2 } },
  points: new Float32Array(),
}

const RIG: Rig = {
  origin: 'imported',
  bones: [
    { name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM, role: 'Hips' },
    { name: 'Spine', parent: 'Hips', rest: IDENTITY_TRANSFORM },
  ],
}

const show = (): void => {
  // What the engine measured, where the tab puts it: this panel is mounted by the DOCK, outside
  // the surface holding the engine.
  useCharacterView.getState().noteCharacterSample(ASSET, SAMPLE)
  render(withQueries(<CharacterInspector assetId={ASSET} />))
}

const held = () => characterOf(useCharacters.getState(), ASSET)

const WORKSHOP = workshopIdOf(ASSET)

/** The model of the workshop, which is what the engine reports a file against. */
const workshopNode = (): string => {
  useScenes.getState().ensure(WORKSHOP, () => workshopScene(ASSET))
  return sceneOf(useScenes.getState(), WORKSHOP).nodes[0]?.id ?? ''
}

/**
 * What the engine read off the FILE, which is what the motion section gates on — the stored rig
 * reads `null` on a fault the engine tolerates, and would take the section away from a model
 * whose own skeleton plays perfectly well.
 */
const readAs = (...boneNames: string[]): void => {
  useModelFiles.getState().reportRig(WORKSHOP, workshopNode(), rigStateFixture(boneNames))
}

/** The material slots the engine read off that file, which is what the dress rows draw. */
const slotsRead = (count: number, names: string[], parts?: readonly ModelPart[]): void => {
  useModelFiles.getState().reportMaterials(WORKSHOP, workshopNode(), count, names, parts)
}

beforeEach(() => {
  clearCharacters()
  clearScenes()
  useAssets.setState({ items: [] })
  useModelFiles.setState({
    materials: {},
    materialNames: {},
    parts: {},
    selectedParts: {},
    stats: {},
    rigs: {},
  })
  useCharacterView.setState({ views: {} })
  openModelMaterial.mockReset()
  reportFailure.mockReset()
  installFakeBridge({})
})

describe('what a character is made of', () => {
  it('offers to make a bare mesh animatable, and nothing to edit yet', () => {
    seedCharacter(ASSET, null, {})
    show()

    expect(screen.getByText(/pas encore animable/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nom')).not.toBeInTheDocument()
  })

  it('says a character is ready, and offers its bones once one is picked', () => {
    seedCharacter(ASSET, RIG, {})
    show()
    expect(screen.queryByLabelText('Articulation')).not.toBeInTheDocument()

    useCharacterView.getState().pickBone(ASSET, 'Spine')
    show()

    expect(screen.getAllByLabelText('Articulation')[0]).toBeInTheDocument()
  })

  // A rig arrives with the names its file spells, and `mixamorigHips` is not one anybody chose.
  it('renames the picked bone, and the rest of the skeleton follows', async () => {
    seedCharacter(ASSET, RIG, {})
    useCharacterView.getState().pickBone(ASSET, 'Hips')
    show()

    // Opened by a double-click, as every other name of the studio is — see `AssetInspector`.
    // The name in the identity row, not the option of the role picker beside it.
    const [shown] = screen.getAllByText('Hips')
    await userEvent.dblClick(shown as HTMLElement)

    // The bone's own field, not the name of a new attachment point further down: both read
    // « Nom », and `find` alone cannot promise one.
    const field = screen
      .getAllByLabelText('Nom')
      .find(one => one.getAttribute('data-sc') === 'field:rename') as HTMLElement
    await userEvent.clear(field)
    await userEvent.type(field, 'Bassin{Enter}')

    expect(held().rig?.bones.map(one => one.name)).toEqual(['Bassin', 'Spine'])
    expect(held().rig?.bones[1]?.parent).toBe('Bassin')
  })

  it('ties a bone to a joint of the standard, taking the role from whoever held it', async () => {
    seedCharacter(ASSET, RIG, {})
    useCharacterView.getState().pickBone(ASSET, 'Spine')
    show()

    await userEvent.selectOptions(screen.getByLabelText('Articulation'), 'Hips')

    expect(held().rig?.bones.find(one => one.name === 'Spine')?.role).toBe('Hips')
    expect(held().rig?.bones.find(one => one.name === 'Hips')?.role).toBeUndefined()
  })

  it('adds a handle the joint reaches for, and takes it back', async () => {
    seedCharacter(ASSET, RIG, {})
    useCharacterView.getState().pickBone(ASSET, 'Spine')
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter une poignée à suivre' }))
    expect(held().rig?.ik).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Retirer la poignée' }))
    expect(held().rig?.ik).toEqual([])
  })

  it('says this character knows no motion yet', () => {
    seedCharacter(ASSET, RIG, {})
    readAs('Hips', 'Spine')
    show()

    expect(screen.getByText(/aucun mouvement/)).toBeInTheDocument()
  })

  /**
   * 🛑 A motion drives JOINTS. On a bare mesh the picker laid a block onto a skeleton that does
   * not exist: it played, the head ran, and the model stood still — with nothing on screen
   * saying why. The section above is where a skeleton is created, and it says so.
   */
  it('offers no motion at all on a mesh that has no skeleton', () => {
    seedCharacter(ASSET, null, {})
    readAs()
    show()

    expect(screen.queryByText(/aucun mouvement/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter un mouvement' })).not.toBeInTheDocument()
  })

  it('offers the existing model material workflow on the character itself', async () => {
    seedCharacter(ASSET, RIG, {})
    show()

    await userEvent.selectOptions(screen.getByLabelText('Recouvert par'), 'materials')

    expect(held().dress).toEqual({ kind: 'materials', documentIds: [''] })
    expect(screen.getByText('Matière 1')).toBeInTheDocument()
  })

  it('names a material slot as the model file names it', () => {
    slotsRead(1, ['Coat'])
    seedCharacter(ASSET, RIG, { dress: { kind: 'materials', documentIds: [''] } })

    show()

    expect(screen.getByText('Coat')).toBeInTheDocument()
  })

  it('shows only the material slots worn by the mesh selected in the scene tree', () => {
    slotsRead(
      2,
      ['Hair', 'Skin'],
      [
        { id: 'mesh-0', name: 'Hair', materialSlots: [0] },
        { id: 'mesh-1', name: 'Head', materialSlots: [1] },
      ],
    )
    useModelFiles.getState().selectPart(WORKSHOP, `${workshopNode()}:mesh-0`)
    seedCharacter(ASSET, RIG, { dress: { kind: 'materials', documentIds: ['', ''] } })

    show()

    expect(screen.getByLabelText('Hair')).toBeInTheDocument()
    expect(screen.queryByLabelText('Skin')).not.toBeInTheDocument()
  })

  it('opens already extracted pictures as an editable material without stripping the model', async () => {
    const texture: Asset = {
      id: 'texture-1',
      name: 'Hero — Couleur de base',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      derivedFrom: ASSET,
      map: 'baseColor',
    }
    const extractTextures = vi.fn(() => Promise.resolve([]))
    installFakeBridge({
      assets: { extractTextures, search: vi.fn(() => Promise.resolve([texture])) },
    })
    openModelMaterial.mockResolvedValue('material-1')
    seedCharacter(ASSET, RIG, { dress: { kind: 'materials', documentIds: [''] } })
    show()

    fireEvent.contextMenu(screen.getByLabelText('Matière 1'))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Assembler depuis le fichier' }))

    expect(extractTextures).not.toHaveBeenCalled()
    expect(openModelMaterial).toHaveBeenCalledWith({ id: ASSET, name: ASSET }, [texture])
    await vi.waitFor(() =>
      expect(held().dress).toEqual({ kind: 'materials', documentIds: ['material-1'] }),
    )
  })

  it('extracts embedded pictures directly from the inspector', async () => {
    const texture: Asset = {
      id: 'texture-1',
      name: 'Hero — Couleur de base',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      derivedFrom: ASSET,
      map: 'baseColor',
    }
    const extractTextures = vi.fn(() => Promise.resolve([texture]))
    const invalidate = vi.spyOn(useAssets.getState(), 'invalidate')
    installFakeBridge({ assets: { extractTextures, update: () => Promise.resolve(texture) } })
    openModelMaterial.mockResolvedValue('material-1')
    useAssets.setState({ items: [LOCAL_MODEL] })
    slotsRead(1, ['Material.001'])
    seedCharacter(ASSET, RIG, {})
    show()
    invalidate.mockClear()

    const mode = screen.getByLabelText('Recouvert par')
    const extractButton = screen.getByRole('button', { name: 'Extraire les textures du modèle' })
    // Two hops up, not one: `Select` draws the box its chevron is pinned to, and the line the
    // action shares is that box's parent.
    expect(mode.parentElement?.parentElement).toContainElement(extractButton)
    await userEvent.click(extractButton)

    await vi.waitFor(() => expect(extractTextures).toHaveBeenCalledWith(ASSET))
    expect(invalidate).toHaveBeenCalledOnce()
    await vi.waitFor(() =>
      expect(held().dress).toEqual({ kind: 'materials', documentIds: ['material-1'] }),
    )
    expect(screen.getByLabelText('Recouvert par')).toHaveValue('materials')
    expect(
      screen.queryByRole('button', { name: 'Extraire les textures du modèle' }),
    ).not.toBeInTheDocument()
  })

  it('keeps image mode without restoring the model file when the extracted image is removed', async () => {
    useAssets.setState({
      items: [
        LOCAL_MODEL,
        {
          id: 'texture-1',
          name: 'Hero — Couleur de base',
          type: 'image',
          location: 'local',
          tags: [],
          createdAt: '2026-09-04T00:00:00.000Z',
        },
      ],
    })
    seedCharacter(ASSET, RIG, { dress: { kind: 'image', assetId: 'texture-1' } })
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Retirer l’image' }))

    expect(held().dress).toEqual({ kind: 'plain' })
    expect(screen.getByLabelText('Recouvert par')).toHaveValue('image')
    expect(screen.queryByRole('option', { name: 'Matière sans image' })).not.toBeInTheDocument()
  })

  it('assembles a data map into a material instead of applying it as an image', async () => {
    const normal: Asset = {
      id: 'normal-1',
      name: 'Hero — Normale',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      derivedFrom: ASSET,
      map: 'normal',
    }
    const extractTextures = vi.fn(() => Promise.resolve([normal]))
    installFakeBridge({ assets: { extractTextures, update: () => Promise.resolve(normal) } })
    openModelMaterial.mockResolvedValue('material-1')
    useAssets.setState({ items: [LOCAL_MODEL] })
    slotsRead(1, ['Material.001'])
    seedCharacter(ASSET, RIG, {})
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Extraire les textures du modèle' }))

    await vi.waitFor(() => expect(extractTextures).toHaveBeenCalledWith(ASSET))
    await vi.waitFor(() =>
      expect(held().dress).toEqual({ kind: 'materials', documentIds: ['material-1'] }),
    )
  })

  it('assembles extracted pictures for a multi-material model', async () => {
    const texture: Asset = {
      id: 'hair-1',
      name: 'Hair — Couleur de base',
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-09-04T00:00:00.000Z',
      derivedFrom: ASSET,
      map: 'baseColor',
    }
    const extractTextures = vi.fn(() => Promise.resolve([texture]))
    installFakeBridge({ assets: { extractTextures, update: () => Promise.resolve(texture) } })
    openModelMaterial.mockResolvedValue('material-1')
    useAssets.setState({ items: [LOCAL_MODEL] })
    slotsRead(2, ['Hair', 'Skin'])
    seedCharacter(ASSET, RIG, {})
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Extraire les textures du modèle' }))

    await vi.waitFor(() => expect(extractTextures).toHaveBeenCalledWith(ASSET))
    await vi.waitFor(() =>
      expect(held().dress).toEqual({ kind: 'materials', documentIds: ['material-1'] }),
    )
  })

  it('disables texture extraction when the model has no local file', () => {
    useAssets.setState({ items: [{ ...LOCAL_MODEL, location: 'cloud' }] })
    seedCharacter(ASSET, RIG, {})
    show()

    expect(screen.getByRole('button', { name: 'Extraire les textures du modèle' })).toBeDisabled()
  })

  it('reports a failed extraction and still refreshes the catalogue', async () => {
    const failure = new Error('broken glb')
    const invalidate = vi.spyOn(useAssets.getState(), 'invalidate')
    installFakeBridge({ assets: { extractTextures: () => Promise.reject(failure) } })
    useAssets.setState({ items: [LOCAL_MODEL] })
    seedCharacter(ASSET, RIG, {})
    show()
    invalidate.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Extraire les textures du modèle' }))

    await vi.waitFor(() =>
      expect(reportFailure).toHaveBeenCalledWith('assets.extract', 'Hero', failure),
    )
    expect(invalidate).toHaveBeenCalledOnce()
  })

  it('removes an unused material slot from its own clear button', async () => {
    slotsRead(1, ['Material.001'])
    seedCharacter(ASSET, RIG, { dress: { kind: 'materials', documentIds: ['', ''] } })
    show()

    const remove = screen.getAllByRole('button', { name: 'Retirer la matière' }).at(-1)
    expect(remove).toBeEnabled()
    if (remove) await userEvent.click(remove)

    expect(held().dress).toEqual({ kind: 'materials', documentIds: [''] })
  })

  // Asked for at the first sight of the panel: a joint could only be put right by eye, and there
  // was no way at all to hold one axis while another moved.
  it('gives a picked joint the fields a scene gives a node, padlock included', async () => {
    seedCharacter(ASSET, RIG, {})
    useCharacterView.getState().pickBone(ASSET, 'Spine')
    show()

    // Folded, the three axes share one line and there is no room for three padlocks — the same
    // rule a scene's transform section follows.
    const [unfold] = screen.getAllByRole('button', { expanded: false })
    await userEvent.click(unfold as HTMLElement)

    await userEvent.click(screen.getByRole('button', { name: 'Figer l’axe X' }))

    expect(characterViewOf(useCharacterView.getState(), ASSET).heldAxes).toEqual(['x'])
  })
})

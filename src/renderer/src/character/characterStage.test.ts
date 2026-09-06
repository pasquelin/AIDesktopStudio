/**
 * The stage: what a character tab lays under the model, and the only thing the bench can drive
 * without a window.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { Rig } from '@shared/domain/rig'
import type { ModelDressRef } from '@shared/domain/scene'
import { workshopIdOf } from '@shared/domain/character'
import { createCharacterStage } from './characterStage'
import { characterOf, useCharacters } from '@/stores/character'
import { renameCharacterBone } from '@/engines/character/characterCommands'
import { clearCharacters } from '@/stores/character-fixtures'
import { clearScenes } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'

const ASSET = 'asset-hero'
const RIG: Rig = {
  origin: 'imported',
  bones: [{ name: 'Hips', parent: null, rest: IDENTITY_TRANSFORM }],
}

const renderer = () => ({ apply: vi.fn(), frameContents: vi.fn(() => true) })

beforeEach(() => {
  clearCharacters()
  clearScenes()
})

describe('editing one character', () => {
  it('lays a workshop scene holding that character and nothing else', () => {
    const stage = createCharacterStage({ renderer: renderer(), assetId: ASSET })

    const nodes = sceneOf(useScenes.getState(), workshopIdOf(ASSET)).nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.type === 'model' && nodes[0].model.assetId).toBe(ASSET)
    stage.close()
  })

  // This window has no outliner to drag from: a band left to fill itself stays empty for ever.
  it('puts that character on the animation sheet, where a scene waits to be dragged there', () => {
    const stage = createCharacterStage({ renderer: renderer(), assetId: ASSET })

    const scene = sceneOf(useScenes.getState(), workshopIdOf(ASSET))
    expect(scene.animation.sheet).toEqual([scene.nodes[0]?.id])
    stage.close()
  })

  it('draws the workshop scene as soon as it is laid', () => {
    const draw = renderer()
    const stage = createCharacterStage({ renderer: draw, assetId: ASSET })

    expect(draw.apply).toHaveBeenCalled()
    stage.close()
  })

  it('holds what the engine read off the file', () => {
    const stage = createCharacterStage({ renderer: renderer(), assetId: ASSET })

    stage.read(RIG, { motions: [{ id: 'm1', name: 'Capoeira', assetId: 'a9' }] })

    const held = characterOf(useCharacters.getState(), ASSET)
    expect(held.rig).toEqual(RIG)
    expect(held.motions).toHaveLength(1)
    stage.close()
  })

  it('holds the material dress read from the model file', () => {
    const stage = createCharacterStage({ renderer: renderer(), assetId: ASSET })
    const dress: ModelDressRef = { kind: 'materials', documentIds: ['material-1'] }

    stage.read(RIG, { dress })

    expect(characterOf(useCharacters.getState(), ASSET).dress).toEqual(dress)
    stage.close()
  })

  // 🛑 A tab remounts whenever the space changes, and the file lands again: reseeding then
  // would throw away an hour of rigging without a word.
  it('leaves a character already open exactly as it stands', () => {
    const first = createCharacterStage({ renderer: renderer(), assetId: ASSET })
    first.read(RIG, { motions: [{ id: 'm1', name: 'Capoeira', assetId: 'a9' }] })
    useCharacters.getState().runCommand(ASSET, renameCharacterBone('Hips', 'Bassin'))
    first.close()

    const again = createCharacterStage({ renderer: renderer(), assetId: ASSET })
    again.read(RIG, null)

    expect(characterOf(useCharacters.getState(), ASSET).rig?.bones[0]?.name).toBe('Bassin')
    again.close()
  })

  // The workshop belongs to the TAB, which is still open: dropped on a remount, the motion being
  // posed would go with it.
  it('keeps the workshop standing when the surface goes', () => {
    const stage = createCharacterStage({ renderer: renderer(), assetId: ASSET })
    stage.read(RIG, null)

    stage.close()

    expect(sceneOf(useScenes.getState(), workshopIdOf(ASSET)).nodes).toHaveLength(1)
  })

  it('aims the view once, and not again as the character moves', () => {
    const draw = renderer()
    const stage = createCharacterStage({ renderer: draw, assetId: ASSET })

    stage.read(RIG, null)
    stage.read(RIG, null)

    expect(draw.frameContents).toHaveBeenCalledTimes(1)
    stage.close()
  })
})

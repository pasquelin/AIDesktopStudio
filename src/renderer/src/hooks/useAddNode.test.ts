import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { PLAYER_KIND } from '@/engines/scene/playerModule'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { addNodeTo } from './useAddNode'

const DOCUMENT = 'doc-1'

const picked = () => sceneOf(useScenes.getState(), DOCUMENT).selectedIds
const nodesIn = () => sceneOf(useScenes.getState(), DOCUMENT).nodes

describe('what an Add leaves picked', () => {
  beforeEach(() => {
    installScene(DOCUMENT, EMPTY_SCENE)
  })

  it('picks the one node it put down', () => {
    addNodeTo(DOCUMENT, 'box')

    expect(picked()).toHaveLength(1)
  })

  /**
   * 🛑 `addNodes` picks EVERYTHING it put down, which is right for a duplicate and wrong for a
   * module: the next gesture would paint the arm and the camera along with the body.
   */
  it('picks the module alone, not the four nodes hanging from it', () => {
    addNodeTo(DOCUMENT, PLAYER_KIND)

    const scene = sceneOf(useScenes.getState(), DOCUMENT)
    expect(picked()).toHaveLength(1)
    expect(scene.nodes.find(node => node.id === picked()[0])?.name).toBe('Player_Module')
  })
})

/**
 * Who the player is was decided at runtime and shown nowhere. A second module puts that choice
 * back, one level up — `playerPartsOf` would take whichever comes first in document order.
 */
describe('a scene that already holds a player module', () => {
  beforeEach(() => {
    installScene(DOCUMENT, EMPTY_SCENE)
    addNodeTo(DOCUMENT, PLAYER_KIND)
  })

  it('refuses a second one rather than letting the order decide', () => {
    addNodeTo(DOCUMENT, PLAYER_KIND)

    expect(nodesIn().filter(node => node.name === 'Player_Module')).toHaveLength(1)
  })

  it('still takes anything else', () => {
    addNodeTo(DOCUMENT, 'box')

    expect(nodesIn().some(node => node.type === 'mesh' && node.name === 'Box')).toBe(true)
  })
})

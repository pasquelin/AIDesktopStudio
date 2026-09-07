import { describe, expect, it } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { groupNode, playerModuleNodes } from './nodeFactory'
import type { SceneNode } from './sceneState'
import { springArmRigsOf } from './springArmRigs'

const LEVEL = () => ({ x: 0, y: 0, z: 0 })

describe('the arm a viewport draws', () => {
  it('reaches up to the pivot and back to the seat, by what the component asks for', () => {
    const nodes = playerModuleNodes()
    const capsule = nodes.find(node => node.name === 'Capsule')
    const arm = nodes.find(node => node.name === 'SpringArm')

    // The component's defaults: 1.6 up off the body, 4 back along the look.
    expect(springArmRigsOf(nodes, LEVEL).get(arm?.id ?? '')).toEqual({
      subjectId: capsule?.id,
      lift: { x: 0, y: 1.6, z: 0 },
      back: { x: 0, y: 0, z: 4 },
    })
  })

  /**
   * 🛑 What the GAME will aim at, never a name read globally: a node called `Capsule` elsewhere in
   * the scene used to capture the arm, and an aid has to draw the arm that will be ridden.
   */
  it('resolves the body inside the module, past a namesake standing outside it', () => {
    const decoy: SceneNode = { ...groupNode(undefined, 'Capsule'), id: 'decoy' }
    const nodes = [decoy, ...playerModuleNodes()]
    const arm = nodes.find(node => node.name === 'SpringArm')

    expect(springArmRigsOf(nodes, LEVEL).get(arm?.id ?? '')?.subjectId).not.toBe('decoy')
  })

  /**
   * 🛑 An arm OUTSIDE a module is never rewritten by `withBoundPlayerArm`, so its field stays the
   * name an author typed — and the game resolves that name (`entityNamed` reads the id, then the
   * name). An aid reading ids alone drew nothing for the very arms one writes by hand.
   */
  it('resolves a body named by a plain name, as the game will', () => {
    const car: SceneNode = { ...groupNode(undefined, 'Car'), id: 'car' }
    const arm: SceneNode = {
      ...groupNode(undefined, 'Arm'),
      id: 'arm',
      components: [{ ...newComponent('SpringArm'), subject: 'Car' }],
    }

    expect(springArmRigsOf([car, arm], LEVEL).get('arm')?.subjectId).toBe('car')
  })

  it('draws nothing for an arm pointed at a body the scene does not hold', () => {
    const lost: SceneNode = {
      ...groupNode(undefined, 'Arm'),
      components: [{ ...newComponent('SpringArm'), subject: 'Nobody', camera: 'Nobody' }],
    }

    expect(springArmRigsOf([lost], LEVEL).size).toBe(0)
  })

  it('answers nothing at all for a scene with no arm in it', () => {
    expect(springArmRigsOf([groupNode()], LEVEL).size).toBe(0)
  })

  /** A shoulder pushes ACROSS the look, so an arm reading a turned node leans the other way. */
  it('swings the shoulder round for an arm that reads a rotation', () => {
    const body: SceneNode = { ...groupNode(undefined, 'Body'), id: 'body' }
    const arm: SceneNode = {
      ...groupNode(undefined, 'Arm'),
      id: 'arm',
      components: [
        { ...newComponent('SpringArm'), subject: 'body', orientation: 'subject', shoulder: 1 },
      ],
    }

    const turned = springArmRigsOf([body, arm], () => ({ x: 0, y: Math.PI / 2, z: 0 }))

    expect(turned.get('arm')?.lift.z).toBeCloseTo(-1)
    expect(turned.get('arm')?.back.x).toBeCloseTo(4)
  })
})

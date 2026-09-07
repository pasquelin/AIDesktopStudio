import { describe, expect, it, onTestFinished } from 'vitest'
import { copiesOf } from './commands'
import { armRest, cameraNode, groupNode, playerModuleNodes } from './nodeFactory'
import { forgetShippedCharacter, rememberShippedCharacter } from './shippedCharacter'
import {
  animatorTargetOf,
  leavesPlayerModule,
  nodesByWord,
  playerModuleFileOf,
  playerModuleFrom,
  playerPartsOf,
  tearsPlayerApart,
  withBoundPlayerArm,
  withPlayerModuleFrom,
} from './playerModule'
import { meshNode } from './scene-fixtures'
import type { SceneNode } from './sceneState'

const armOf = (nodes: readonly SceneNode[], moduleId: string) =>
  nodes.find(
    node => node.parentId === moduleId && node.components?.some(one => one.type === 'SpringArm'),
  )

const childOf = (nodes: readonly SceneNode[], parentId: string) =>
  nodes.find(node => node.parentId === parentId)

describe('what a module points its arm at', () => {
  /** A name a reader sees, resolved to the exact node of THIS module — never a namesake. */
  it('resolves the name its arm carries to its own node', () => {
    const foreign = { ...groupNode(undefined, 'Capsule'), id: 'other-capsule' }
    const nodes = withBoundPlayerArm([foreign, ...playerModuleNodes()])
    const module = nodes.find(node => node.name === 'Player_Module')
    const arm = armOf(nodes, module?.id ?? '')

    expect(arm?.components?.[0]?.subject).toBe(playerPartsOf(nodes)?.body?.id)
    expect(arm?.components?.[0]?.subject).not.toBe('other-capsule')
  })

  it('is the body and the eye it hangs with', () => {
    const nodes = withBoundPlayerArm(playerModuleNodes())
    const module = nodes[0]
    const arm = armOf(nodes, module?.id ?? '')

    expect(arm?.components?.[0]?.subject).toBe(playerPartsOf(nodes)?.body?.id)
    expect(arm?.components?.[0]?.camera).toBe(childOf(nodes, arm?.id ?? '')?.id)
  })

  /**
   * 🛑 `copiesOf` remaps `id` and `parentId` and NOTHING inside a component, so a duplicated
   * module carries an arm still pointed at the original's camera — measured, and a name did it too.
   */
  it('is its OWN eye in a module that was duplicated', () => {
    const first = playerModuleNodes()
    const both = [...first, ...copiesOf(first, [first[0] ?? ({} as SceneNode)])]
    const bound = withBoundPlayerArm(both)
    const copy = bound.filter(node => !first.some(one => one.id === node.id))
    const arm = armOf(bound, copy[0]?.id ?? '')

    expect(arm?.components?.[0]?.camera).toBe(childOf(bound, arm?.id ?? '')?.id)
    expect(first.some(node => node.id === arm?.components?.[0]?.camera)).toBe(false)
  })

  /** A scene may hold cameras of its own, and one of them met first is not the module's choice. */
  it('names the eye its own arm carries, never a loose camera of the scene', () => {
    const module = playerModuleNodes()
    const nodes = [cameraNode(), ...module]

    expect(playerPartsOf(nodes)?.eye?.id).toBe(module.find(node => node.type === 'camera')?.id)
  })

  it('names nothing at all where the scene holds no module', () => {
    expect(playerPartsOf([cameraNode()])).toBeNull()
  })

  it('routes a module script to that module’s animated mesh, not the first player in the list', () => {
    rememberShippedCharacter('asset-hero')
    onTestFinished(forgetShippedCharacter)
    const first = playerModuleNodes()
    const second = playerModuleNodes().map(node =>
      node.name === 'Player_Module' ? { ...node, name: 'Other' } : node,
    )
    const nodes = [...first, ...second]
    const other = nodes.find(node => node.name === 'Other')
    const mesh = playerPartsOf(second)?.animated

    expect(animatorTargetOf(nodes, first[0]?.id ?? '')).toBe(playerPartsOf(first)?.animated?.id)
    expect(animatorTargetOf(nodes, other?.id ?? '')).toBe(mesh?.id)
    expect(animatorTargetOf(nodes, other?.id ?? '')).not.toBe(playerPartsOf(first)?.animated?.id)
  })

  /**
   * 🛑 Both fields stay editable. An author aiming the arm at the car the player drives must not
   * have it put back on the capsule at every Play — only what points INSIDE is resolved.
   */
  it('leaves a subject the author aimed somewhere else alone', () => {
    const car = groupNode(undefined, 'Car')
    const nodes = withBoundPlayerArm([
      car,
      ...playerModuleNodes().map(node =>
        node.name === 'SpringArm' && node.components?.[0]
          ? { ...node, components: [{ ...node.components[0], subject: car.id }] }
          : node,
      ),
    ])
    const arm = nodes.find(node => node.name === 'SpringArm')

    expect(arm?.components?.[0]?.subject).toBe(car.id)
  })

  /** A camera tidied into a group of its own under the arm is still the eye the module films. */
  it('finds its eye however deep under the arm it was tidied', () => {
    const built = playerModuleNodes()
    const arm = built.find(node => node.name === 'SpringArm')
    const holder = { ...groupNode(undefined, 'Eye'), parentId: arm?.id ?? null }
    const nodes = built.map(node =>
      node.type === 'camera' ? { ...node, parentId: holder.id } : node,
    )

    expect(playerPartsOf([...nodes, holder])?.eye?.type).toBe('camera')
  })

  /**
   * 🛑 An arm acts only once the scene PLAYS, so nothing in the editor would move the camera off
   * its parent's origin — where it stood at the player's feet, with no arm drawn to explain it.
   */
  it('seats its camera where the arm will put it on the first frame', () => {
    const nodes = playerModuleNodes()
    const camera = nodes.find(node => node.type === 'camera')

    // The two components' defaults: half of 1,8 up to the body's centre, 1,6 over it, 4 back.
    expect(camera?.transform.position).toEqual({ x: 0, y: 2.5, z: 4 })
  })

  /**
   * 🛑 Turned to LOOK where the arm aims, which is its PIVOT — `lookAt` defaults there. Born
   * unturned it faced away from the body; aimed at the body's own feet it tipped 21,8° the moment
   * Play took over, and the arm only acts once the scene plays.
   */
  it('turns its camera onto the pivot its arm aims at', () => {
    const nodes = playerModuleNodes()
    const camera = nodes.find(node => node.type === 'camera')
    const capsule = nodes.find(node => node.name === 'Capsule')
    if (!camera || !capsule) throw new Error('no module')
    const body = { transform: { position: armRest(capsule.transform.position).pivot } }

    // Where the camera looks: its own −z, turned by the node's rotation (three's default order).
    const { x: pitch, y: yaw } = camera.transform.rotation
    const ahead = {
      x: -Math.cos(pitch) * Math.sin(yaw),
      y: Math.sin(pitch),
      z: -Math.cos(pitch) * Math.cos(yaw),
    }
    const to = {
      x: body.transform.position.x - camera.transform.position.x,
      y: body.transform.position.y - camera.transform.position.y,
      z: body.transform.position.z - camera.transform.position.z,
    }
    const reach = Math.hypot(to.x, to.y, to.z)

    // Both unit vectors: pointing AT the pivot means the two agree exactly.
    expect(ahead.x).toBeCloseTo(to.x / reach, 5)
    expect(ahead.y).toBeCloseTo(to.y / reach, 5)
    expect(ahead.z).toBeCloseTo(to.z / reach, 5)
  })

  it('leaves a scene holding no module untouched', () => {
    const nodes = playerModuleNodes().slice(1)

    expect(withBoundPlayerArm(nodes)).toBe(nodes)
  })
})

/**
 * The studio had no notion of a node that must CONTAIN something. Without one, `reparent` and
 * Delete take a module apart in silence and the camera falls back on the sweep — the very
 * arbitration the module exists to replace.
 */
describe('what a module refuses to lose', () => {
  const scene = () => [...playerModuleNodes()]
  const idOf = (nodes: readonly SceneNode[], name: string) =>
    nodes.find(node => node.name === name)?.id ?? ''

  it('is torn by a delete that takes its eye and leaves it standing', () => {
    const nodes = scene()

    expect(tearsPlayerApart(nodes, [idOf(nodes, 'Camera')])).toBe(true)
  })

  /** Deleting the module takes everything under it: a whole module going, not a torn one. */
  it('is not torn by a delete that takes the module itself', () => {
    const nodes = scene()
    expect(tearsPlayerApart(nodes, [idOf(nodes, 'Player_Module')])).toBe(false)
  })

  it('is not torn by a delete of what it does not require', () => {
    const nodes = scene()

    expect(tearsPlayerApart(nodes, [idOf(nodes, 'Mesh')])).toBe(false)
  })

  it('is torn by a drag that hangs its body outside the module', () => {
    const nodes = scene()

    expect(leavesPlayerModule(nodes, idOf(nodes, 'Capsule'), null)).toBe(true)
  })

  /** Rearranging INSIDE the module is the author's business: only leaving it is refused. */
  it('is not torn by a drag that keeps the body under the module', () => {
    const nodes = scene()

    expect(leavesPlayerModule(nodes, idOf(nodes, 'Capsule'), idOf(nodes, 'SpringArm'))).toBe(false)
  })

  it('says nothing about a node the module does not require', () => {
    const nodes = scene()

    expect(leavesPlayerModule(nodes, idOf(nodes, 'Mesh'), null)).toBe(false)
  })
})

/**
 * 🛑 `removeNode` takes ONE node and orphans what hung from it — `flattenTree` then drops the
 * orphan. A node BETWEEN the module and a required part is therefore as costly as the part.
 */
describe('a node standing between the module and what it requires', () => {
  const withHolder = () => {
    const built = playerModuleNodes()
    const arm = built.find(node => node.name === 'SpringArm')
    const holder = { ...groupNode(undefined, 'Rig'), parentId: arm?.id ?? null }
    return [
      ...built.map(node => (node.type === 'camera' ? { ...node, parentId: holder.id } : node)),
      holder,
    ]
  }

  it('is refused, since taking it away takes the eye out of the module', () => {
    const nodes = withHolder()
    const holder = nodes.find(node => node.name === 'Rig')

    expect(tearsPlayerApart(nodes, [holder?.id ?? ''])).toBe(true)
  })

  it('still lets go of a node nothing required hangs under', () => {
    const nodes = withHolder()
    const mesh = nodes.find(node => node.name === 'Mesh')

    expect(tearsPlayerApart(nodes, [mesh?.id ?? ''])).toBe(false)
  })
})

/**
 * A module travels as a glTF of its own: the same five nodes, read back by the same door the
 * scene uses. The scene keeps the nodes AND a trace of the file — a strict reader opens both.
 */
describe('a module written as a file of its own', () => {
  it('carries the module and nothing else of the scene', () => {
    const module = playerModuleNodes()
    const scene = [meshNode('floor'), ...module]

    // The SET and the parenting are what a file carries; `subtreesOf` walks its own order.
    expect(
      playerModuleFileOf(scene)
        ?.map(node => node.name)
        .sort(),
    ).toEqual(module.map(node => node.name).sort())
    expect(playerModuleFileOf(scene)?.[0]?.name).toBe('Player_Module')
  })

  it('answers nothing for a scene that holds no module', () => {
    expect(playerModuleFileOf([meshNode('floor')])).toBeNull()
  })

  /** The trace rides in the `Player` component, where every other component already travels. */
  it('remembers the file its nodes were read out of', () => {
    const filed = withPlayerModuleFrom(playerModuleNodes(), 'modules/Heros.player.gltf')

    expect(playerModuleFrom(filed)).toBe('modules/Heros.player.gltf')
  })

  it('has no trace before it is filed', () => {
    expect(playerModuleFrom(playerModuleNodes())).toBeNull()
  })
})

/**
 * The viewport aid and the playing module BOTH resolve a `subject` through this. They used to
 * spell it apart — one kept the first homonym, the other the last, and a node's id could be
 * overwritten by another node's name — so an arm was drawn towards one subject and animated
 * towards another, with nothing to say so.
 */
describe('the node a word names', () => {
  it('answers the first of two nodes sharing a name', () => {
    const first = { ...meshNode('node_one'), name: 'Target' }
    const second = { ...meshNode('node_two'), name: 'Target' }

    expect(nodesByWord([first, second]).get('Target')?.id).toBe('node_one')
  })

  it('never lets a name take an id', () => {
    const target = meshNode('Target')
    const impostor = { ...meshNode('node_two'), name: 'Target' }

    expect(nodesByWord([target, impostor]).get('Target')?.id).toBe('Target')
  })

  it('answers nothing for a word that names neither', () => {
    expect(nodesByWord([meshNode('Target')]).get('absent')).toBeUndefined()
  })
})

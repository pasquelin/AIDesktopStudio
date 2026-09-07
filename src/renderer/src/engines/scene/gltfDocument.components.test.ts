import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { newComponent } from '@shared/domain/componentRegistry'
import { GLTF_SCENE_STATE } from '@shared/domain/gltf'
import { isRecord } from '@shared/guards'
import {
  gltfDocumentOf,
  sceneFromGltf,
  sceneHoldsMore,
  type GltfDocumentOptions,
} from './gltfDocument'
import { playerModuleNodes } from './nodeFactory'
import { playerPartsOf } from './playerModule'
import { meshNode } from './scene-fixtures'
import { EMPTY_SCENE, type SceneState } from './sceneState'

const WRITTEN: GltfDocumentOptions = { documentId: 'doc-1', documentKind: 'scene' }

const sceneWith = (components?: readonly Component[]): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [components === undefined ? meshNode('a') : { ...meshNode('a'), components }],
})

const written = (state: SceneState): Record<string, unknown> => {
  const document = gltfDocumentOf(state, WRITTEN)
  if (!isRecord(document)) throw new Error('not a document')
  return document
}

/** The payload's own nodes, which is where a component rides — see `ScenePayload`. */
const payloadNodes = (document: Record<string, unknown>): Record<string, unknown>[] => {
  const scenes = document.scenes
  const first = Array.isArray(scenes) ? scenes[0] : null
  const extras = isRecord(first) ? first.extras : null
  const studio = isRecord(extras) ? extras.aidesktopstudio : null
  const state = isRecord(studio) ? studio[GLTF_SCENE_STATE] : null
  const nodes = isRecord(state) ? state.nodes : null
  return Array.isArray(nodes) ? nodes.filter(isRecord) : []
}

describe('a scene document carrying components', () => {
  it('writes them and reads them back unchanged', () => {
    const health = newComponent('Health')
    const back = sceneFromGltf(written(sceneWith([health])))

    expect(back.nodes[0]?.components).toEqual([health])
  })

  /** The byte-for-byte promise: a document written before components exist gains no key. */
  it('leaves a node that carries none without the key at all', () => {
    expect(payloadNodes(written(sceneWith()))[0]).not.toHaveProperty('components')
    expect(sceneFromGltf(written(sceneWith()))).toEqual(sceneWith())
  })

  /**
   * A type this build has no system for is dropped from the state — nothing would simulate it —
   * and the refusal below is what stops a save from losing it from the FILE too.
   */
  it('drops a component of a type this build does not know', () => {
    const document = written(sceneWith([newComponent('Health')]))
    const node = payloadNodes(document)[0]
    if (node) node.components = [{ type: 'Wings', span: 2 }]

    expect(sceneFromGltf(document).nodes[0]?.components).toEqual([])
  })

  // 🛑 A rig belongs to the model's own file now, and this reader drops the one a node holds.
  // Written back in silence, a ⌘S on an old scene would take every skeleton it carried with it.
  it('refuses to save over a scene still carrying a skeleton on one of its nodes', () => {
    const document = written(sceneWith())
    const node = payloadNodes(document)[0]
    if (node) node.model = { assetId: 'x', rig: { origin: 'local', bones: [] } }

    expect(sceneHoldsMore(document)).toEqual(['nodes.model.rig'])
  })

  it('refuses to save over a file holding a component it cannot act on', () => {
    const document = written(sceneWith([newComponent('Health')]))
    const node = payloadNodes(document)[0]
    if (node) node.components = [newComponent('Health'), { type: 'Wings', span: 2 }]

    expect(sceneHoldsMore(document)).toEqual(['components.Wings'])
  })

  it('finds nothing to refuse in a file whose components it knows', () => {
    expect(sceneHoldsMore(written(sceneWith([newComponent('Health')])))).toEqual([])
  })
})

/**
 * The reader empties a `components` that is not a list; without a refusal the loss would be
 * written back at the first ⌘S, with no journal line and no gate going red.
 */
describe('a components member that is not a list at all', () => {
  it('refuses to save over it, rather than emptying it in silence', () => {
    const document = written(sceneWith([newComponent('Health')]))
    const node = payloadNodes(document)[0]
    if (node) node.components = { Health: { max: 10 } }

    expect(sceneFromGltf(document).nodes[0]?.components).toEqual([])
    expect(sceneHoldsMore(document)).toEqual(['components'])
  })
})

/**
 * The module is the one node whose MEANING is its shape: a marker on a group, a body under it, a
 * camera under an arm. A save that keeps the components and loses the parenting keeps nothing.
 */
describe('a player module written to a file and read back', () => {
  const saved = (): SceneState =>
    sceneFromGltf(written({ ...EMPTY_SCENE, nodes: [...playerModuleNodes()] }))

  it('comes back with its body under it and its camera under its arm', () => {
    const back = saved()
    const at = (name: string) => back.nodes.find(node => node.name === name)

    // The figure's own parts ride along; what a module MEANS is these five and how they hang.
    expect(back.nodes.map(node => node.name)).toEqual(
      expect.arrayContaining(['Player_Module', 'Capsule', 'Figure', 'SpringArm', 'Camera']),
    )
    expect(at('Capsule')?.parentId).toBe(at('Player_Module')?.id)
    expect(at('Figure')?.parentId).toBe(at('Capsule')?.id)
    expect(at('SpringArm')?.parentId).toBe(at('Player_Module')?.id)
    expect(at('Camera')?.parentId).toBe(at('SpringArm')?.id)
  })

  it('is still the node the studio reads as the player', () => {
    const back = saved()

    expect(playerPartsOf(back.nodes)?.body?.id).toBe(
      back.nodes.find(node => node.name === 'Capsule')?.id,
    )
  })
})

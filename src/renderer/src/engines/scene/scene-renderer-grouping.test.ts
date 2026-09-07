// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { Mesh } from 'three'
import { SceneRenderer } from './SceneRenderer'
import { meshNode } from './scene-fixtures'
import { runtimeState } from './runtimeWorldArtifacts'
import type { RuntimeRenderArtifact } from './grouping'
import { EMPTY_SCENE, type SceneNode, type SceneState } from './sceneState'

/**
 * Read off the strategy rather than off the engine: what the plan decides is which meshes the
 * viewport draws WITH, and a merged group is the only one two nodes can reach — the instancing
 * floor is sixteen.
 */
const drawnBy = (renderer: SceneRenderer): readonly Mesh[] => renderer['instances'].drawn()

const rendererOn = (state: SceneState): SceneRenderer => {
  const renderer = new SceneRenderer({ onSelect: () => {}, onTransform: () => {} })
  renderer.apply(state)
  return renderer
}

const mergeOf = (...sourceIds: string[]): RuntimeRenderArtifact => ({
  key: 'merge_boxes',
  strategy: 'merge',
  sourceIds,
  signature: 'boxes',
})

describe('a document carrying a compiled runtime optimization', () => {
  it('groups the viewport by that plan rather than by each node mode', () => {
    const nodes: SceneNode[] = [meshNode('box_1'), meshNode('box_2')]
    const heuristic = rendererOn({ ...EMPTY_SCENE, nodes })

    const planned = rendererOn(
      runtimeState({ ...EMPTY_SCENE, nodes }, nodes, [mergeOf('box_1', 'box_2')]),
    )

    expect(drawnBy(heuristic)).toHaveLength(0)
    expect(drawnBy(planned)).toHaveLength(1)
    heuristic.dispose()
    planned.dispose()
  })
})

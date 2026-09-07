import { describe, expect, it } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { directionalLight, meshNode } from './scene-fixtures'
import { EMPTY_SCENE, type SceneState } from './sceneState'

/**
 * What the engine hands the exporters, checked on the file it produces.
 *
 * The renderer is never mounted: building the objects needs no GL context, and this is the half
 * of it a test can reach — which is exactly the half that decides what leaves the studio.
 */
function rendererOf(state: Partial<SceneState>): SceneRenderer {
  const renderer = new SceneRenderer({ onSelect: () => {}, onTransform: () => {} })
  renderer.apply({ ...EMPTY_SCENE, ...state })
  return renderer
}

async function namesIn(renderer: SceneRenderer, scope: 'scene' | 'selection'): Promise<string[]> {
  const bytes = await renderer.exportTo('gltf', scope)
  // `as`: what a `.gltf` file holds is glTF, and `nodes` is the field a reader looks at first.
  const file = JSON.parse(new TextDecoder().decode(bytes)) as { nodes?: { name?: string }[] }
  return (file.nodes ?? []).flatMap(node => node.name ?? [])
}

describe('SceneRenderer export', () => {
  it('writes the nodes of the document, meshes and lights alike', async () => {
    const renderer = rendererOf({ nodes: [meshNode('box-1'), directionalLight('light-1')] })

    expect(await namesIn(renderer, 'scene')).toEqual(['box-1', 'light-1'])
  })

  /**
   * The claim the plan asked to check on the file rather than assume. A directional light builds
   * a helper *and* a target, both added to the viewport beside the nodes — and the helper even
   * answers to the light's own id, so a click on it selects the light. Neither reaches the file:
   * exactly two nodes come out for the two the document holds.
   */
  it('leaves the grid, the helpers and the light targets behind', async () => {
    const renderer = rendererOf({ nodes: [meshNode('box-1'), directionalLight('light-1')] })

    expect(await namesIn(renderer, 'scene')).toHaveLength(2)
  })

  it('writes only what is selected when asked for the selection', async () => {
    const renderer = rendererOf({
      nodes: [meshNode('box-1'), meshNode('box-2')],
      selectedIds: ['box-2'],
    })

    expect(await namesIn(renderer, 'selection')).toEqual(['box-2'])
  })

  // A child travels with its parent: handed over as well, it would be written twice.
  it('hands over a subtree once, through its root', async () => {
    const renderer = rendererOf({
      nodes: [meshNode('parent'), meshNode('child', 'parent')],
      selectedIds: ['parent', 'child'],
    })

    expect(await namesIn(renderer, 'selection')).toEqual(['parent', 'child'])
  })

  it('writes an empty file when nothing is selected', async () => {
    const renderer = rendererOf({ nodes: [meshNode('box-1')], selectedIds: [] })

    expect(await namesIn(renderer, 'selection')).toEqual([])
  })

  /**
   * 🛑 Measured on the file the real exporter writes, never deduced: what a motion carries of this
   * studio rides on the SCENE — `GLTFLoader` hands `scenes[i].extras` back as `scene.userData`, and
   * reads nothing of the root's — and three writes it only through the scene's own `userData`.
   */
  it('writes what the studio asked to carry into the extras of the scene', async () => {
    const renderer = rendererOf({ nodes: [meshNode('box-1')] })

    const bytes = await renderer.exportTo('gltf', 'scene', { aidesktopstudio: { animation: { fps: 25 } } })
    const file = JSON.parse(new TextDecoder().decode(bytes)) as {
      scenes?: { extras?: Record<string, unknown> }[]
    }

    expect(file.scenes?.[0]?.extras).toEqual({ aidesktopstudio: { animation: { fps: 25 } } })
  })
})

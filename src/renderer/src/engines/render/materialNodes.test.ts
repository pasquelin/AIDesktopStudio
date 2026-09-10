import { MeshStandardMaterial, Texture } from 'three'
import type { Node } from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { createUniforms } from '../material/materialShader'
import { applyMaterialNodes } from './materialNodes'
import type { GpuModule } from './gpuModule'

/**
 * The bundle itself, imported rather than mocked: building a node graph needs no device, and a
 * doubled TSL would prove the double rather than the graph. Nothing here draws.
 */
let gpu: GpuModule

beforeAll(async () => {
  const [webgpu, tsl, gtao] = await Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
    import('three/addons/tsl/display/GTAONode.js'),
  ])
  gpu = { webgpu, tsl, gtao }
})

/** Every uniform of a built graph, which is where the bridge to the engine's own values shows. */
function uniformsOf(
  node: Node | null,
): readonly { value: unknown; update: (frame: never) => void }[] {
  const found: { value: unknown; update: (frame: never) => void }[] = []
  node?.traverse(one => {
    if ('isUniformNode' in one && one.isUniformNode === true) {
      // `as`: what a uniform node holds is its `value`, and the type of the graph's members is
      // the base `Node` — the narrowing is the `isUniformNode` flag three itself writes.
      found.push(one as unknown as { value: unknown; update: (frame: never) => void })
    }
  })
  return found
}

const holding = (nodes: ReturnType<typeof uniformsOf>, value: unknown): boolean =>
  nodes.some(node => node.value === value)

describe('the material patch as nodes', () => {
  // 🛑 Shared, never copied: the material window writes into these very objects, and a copy
  // would leave the Advanced engine showing the remap the panel opened on for ever.
  it('reads the remaps out of the objects the Compatible engine writes into', () => {
    const material = new MeshStandardMaterial()
    const uniforms = createUniforms()
    applyMaterialNodes(gpu, material, uniforms)

    expect(holding(uniformsOf(material.roughnessNode), uniforms.roughnessRemap.value)).toBe(true)
    expect(holding(uniformsOf(material.metalnessNode), uniforms.metalnessRemap.value)).toBe(true)
  })

  it('re-reads what is replaced rather than written into, on every render', () => {
    // A scalar and a texture are assigned, not mutated: shared by reference they would freeze.
    const material = new MeshStandardMaterial()
    const uniforms = createUniforms()
    applyMaterialNodes(gpu, material, uniforms)
    const mask = new Texture()
    uniforms.edgeIntensity.value = 0.75
    uniforms.edgeMap.value = mask

    for (const node of uniformsOf(material.colorNode)) node.update(EMPTY_FRAME)

    const held = uniformsOf(material.colorNode)
    expect(holding(held, 0.75)).toBe(true)
    expect(holding(held, mask)).toBe(true)
  })

  it('follows the material own factors, which the window writes onto it directly', () => {
    const material = new MeshStandardMaterial()
    applyMaterialNodes(gpu, material, createUniforms())
    material.roughness = 0.35

    for (const node of uniformsOf(material.roughnessNode)) node.update(EMPTY_FRAME)

    expect(holding(uniformsOf(material.roughnessNode), 0.35)).toBe(true)
  })

  // 🛑 What the GLSL patch cannot do: it is guarded by `#ifdef USE_ROUGHNESSMAP`, so every slot
  // filled or emptied rebuilds the program. Here it moves a number.
  it('keeps one graph when a channel is filled', () => {
    const material = new MeshStandardMaterial()
    applyMaterialNodes(gpu, material, createUniforms())
    const built = material.roughnessNode
    material.roughnessMap = new Texture()

    for (const node of uniformsOf(material.roughnessNode)) node.update(EMPTY_FRAME)

    expect(material.roughnessNode).toBe(built)
    expect(holding(uniformsOf(material.roughnessNode), 1)).toBe(true)
  })
})

/** What a node update reads of the frame here: nothing. Every callback of this module ignores it. */
const EMPTY_FRAME = {} as never

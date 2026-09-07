import { MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { bindReliefSplat, patchReliefSplatFragment } from './reliefSplatShader'

describe('relief splat shader', () => {
  it('binds four albedos, four normals, and one shared weight texture', () => {
    const textures = Array.from({ length: 9 }, () => new Texture())
    const textureAt = (index: number): Texture => {
      const texture = textures[index]
      if (!texture) throw new Error('missing texture fixture')
      return texture
    }
    const first = textureAt(0)
    const material = new MeshStandardMaterial({ map: first })
    bindReliefSplat(material, {
      albedos: Array.from({ length: 4 }, (_, index) => ({ value: textureAt(index) })),
      normals: Array.from({ length: 4 }, (_, index) => ({ value: textureAt(index + 4) })),
      weights: { value: textureAt(8) },
    })
    const shader = {
      uniforms: {},
      vertexShader: 'void main() {\n#include <uv_vertex>\n}',
      fragmentShader: 'void main() {\n#include <map_fragment>\n#include <normal_fragment_maps>\n}',
    }

    Reflect.apply(material.onBeforeCompile, material, [shader])

    expect(Object.keys(shader.uniforms)).toHaveLength(9)
    expect(material.map).toBeNull()
    expect(material.normalMap).toBeNull()
  })

  it('normalizes painted weights and falls back to the first layer at zero', () => {
    const patched = patchReliefSplatFragment(
      'void main() {\n#include <map_fragment>\n#include <normal_fragment_maps>\n}',
    )

    expect(patched).toContain('scWeights / scWeightSum')
    expect(patched).toContain('vec4( 1.0, 0.0, 0.0, 0.0 )')
    expect(patched).toContain('scGroundNormal3')
  })
})

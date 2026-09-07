import { bench } from '@shared/vitestBench'
import { Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry } from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { describe } from 'vitest'
import { NO_LOSSY_OPTIMIZATION } from '@shared/domain/gameExport'
import { compileLossyModels } from './lossyModelCompiler'

const modifier = new SimplifyModifier()

describe('imported model LOSSY compilation', () => {
  bench('one 1,089-vertex model into two distant levels', async () => {
    await compileLossyModels(
      [{ id: 'sphere', url: 'fixture://sphere' }],
      { ...NO_LOSSY_OPTIMIZATION, generateLods: true },
      undefined,
      {
        load: async () => new Mesh(new SphereGeometry(1, 32, 32), new MeshStandardMaterial()),
        simplify: async (geometry, ratios) => ratios.map(ratio => simplified(geometry, ratio)),
        dispose: () => undefined,
      },
    )
  })
})

function simplified(geometry: BufferGeometry, ratio: number): BufferGeometry {
  const vertices = geometry.getAttribute('position').count
  return modifier.modify(geometry, Math.min(vertices - 3, Math.floor(vertices * ratio)))
}

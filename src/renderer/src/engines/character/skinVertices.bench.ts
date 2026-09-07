import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { SKIN_REGIONS, type SkinRequest } from './skinMessage'
import { skinVertices } from './skinVertices'
import { loadSkinVerticesWasm } from './skinVerticesWasm'

const BONES = 52

function request(vertices: number): SkinRequest {
  const position = new Float32Array(vertices * 3)
  for (let vertex = 0; vertex < vertices; vertex++) {
    position[vertex * 3] = (vertex % 100) / 100
    position[vertex * 3 + 1] = ((vertex / 100) % 200) / 100
    position[vertex * 3 + 2] = ((vertex / 20_000) % 100) / 100
  }

  const segments = new Float32Array(BONES * 6)
  for (let bone = 0; bone < BONES; bone++) {
    const x = (bone % 8) / 8
    const y = Math.floor(bone / 8) / 4
    segments.set([x, y, 0, x, y + 0.25, 0], bone * 6)
  }

  return {
    id: 1,
    position,
    segments,
    regions: new Uint8Array(BONES).fill(SKIN_REGIONS.indexOf('trunk')),
  }
}

const bindWithWasm = await loadSkinVerticesWasm()

describe('binding a dense character to 52 bones', () => {
  for (const vertices of [50_000, 250_000, 500_000]) {
    const input = request(vertices)
    const options = {
      time: 200,
      iterations: 1,
      warmupTime: 0,
      warmupIterations: 1,
    }
    bench(`TypeScript · ${vertices} vertices`, () => void skinVertices(input), options)
    bench(
      `WebAssembly · ${vertices} vertices`,
      () => {
        const binding = bindWithWasm(input)
        binding.skinRange(0, vertices)
        binding.binding()
      },
      options,
    )
  }
})

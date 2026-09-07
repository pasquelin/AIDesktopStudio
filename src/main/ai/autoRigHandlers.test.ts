import { describe, expect, it } from 'vitest'
import { parseAutoRigRequest } from './autoRigHandlers'

const valid = () => ({
  id: 'rig-1',
  backendId: 'make-it-animatable',
  positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  triangles: Uint32Array.from([0, 1, 2]),
  primitives: [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 3 }],
  options: { fingers: 'detailed', useSurfaceNormals: true, weightPostProcessing: true },
})

describe('Auto Rig IPC request validation', () => {
  it('accepts a finite triangulated mesh whose primitives cover every vertex', () => {
    expect(parseAutoRigRequest(valid())).toMatchObject({ id: 'rig-1' })
  })

  it('refuses malformed numeric buffers before the host sees them', () => {
    expect(() => parseAutoRigRequest({ ...valid(), positions: new Float32Array(10) })).toThrow()
    expect(() => parseAutoRigRequest({ ...valid(), triangles: new Uint32Array(4) })).toThrow()
    expect(() =>
      parseAutoRigRequest({
        ...valid(),
        positions: Float32Array.from([0, 0, Number.NaN, 1, 0, 0, 0, 1, 0]),
      }),
    ).toThrow()
    expect(() =>
      parseAutoRigRequest({ ...valid(), triangles: Uint32Array.from([0, 1, 3]) }),
    ).toThrow()
  })

  it('refuses a primitive partition with a gap, overlap, duplicate target, or partial coverage', () => {
    const base = valid()
    for (const primitives of [
      [{ mesh: 0, primitive: 0, vertexOffset: 1, vertexCount: 2 }],
      [
        { mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 2 },
        { mesh: 1, primitive: 0, vertexOffset: 1, vertexCount: 2 },
      ],
      [
        { mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 1 },
        { mesh: 0, primitive: 0, vertexOffset: 1, vertexCount: 2 },
      ],
      [{ mesh: 0, primitive: 0, vertexOffset: 0, vertexCount: 2 }],
    ])
      expect(() => parseAutoRigRequest({ ...base, primitives })).toThrow()
  })

  it('reuses the product mesh budget for the IPC payload', () => {
    expect(() => parseAutoRigRequest(valid(), 16)).toThrow()
  })

  it('accepts only the supported MIA quality settings', () => {
    expect(parseAutoRigRequest(valid()).options).toEqual({
      fingers: 'detailed',
      useSurfaceNormals: true,
      weightPostProcessing: true,
    })
    expect(() => parseAutoRigRequest({ ...valid(), options: { fingers: 'invented' } })).toThrow()
  })
})

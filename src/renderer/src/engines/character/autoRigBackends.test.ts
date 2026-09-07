import { describe, expect, it, vi } from 'vitest'
import { autoRigServiceFor } from './autoRigBackends'
import type { AutoRigResult } from '@shared/domain/autoRig'

describe('Auto Rig backend registry', () => {
  it('publishes installed backend implementations without announcing future ones', () => {
    const service = autoRigServiceFor(vi.fn(), vi.fn())

    expect(service.available().map(backend => backend.id)).toEqual(['simple', 'make-it-animatable'])
  })

  it('runs Simple without touching the advanced inference callback', async () => {
    const result: AutoRigResult = {
      rig: {
        origin: 'local',
        bones: [
          {
            name: 'Hips',
            parent: null,
            rest: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0 },
              scale: { x: 1, y: 1, z: 1 },
            },
          },
        ],
      },
      bindings: [
        {
          mesh: 0,
          primitive: 0,
          skinIndex: new Uint16Array(4),
          skinWeight: Float32Array.from([1, 0, 0, 0]),
        },
      ],
      metadata: { backendId: 'simple', sourceInfluences: 4, outputInfluences: 4, fingers: false },
    }
    const simple = vi.fn(async () => result)
    const advanced = vi.fn()
    const service = autoRigServiceFor(simple, advanced)

    await service.run(
      'simple',
      { fingers: 'detailed', useSurfaceNormals: false, weightPostProcessing: true },
      {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        targets: [{ mesh: 0, primitive: 0, vertexCount: 1 }],
      },
    )

    expect(simple).toHaveBeenCalledOnce()
    expect(advanced).not.toHaveBeenCalled()
  })
})

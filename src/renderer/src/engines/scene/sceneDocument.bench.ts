import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { meshNode } from './scene-fixtures'
import { sceneFromPayload } from './sceneDocument'
import { DEFAULT_MATERIAL, type SceneNode } from './sceneState'

/**
 * What opening a document costs the window that opens it. Validation runs on the UI thread,
 * once per open — not per frame — but a scene that takes a second to check is a viewport that
 * looks broken while it loads.
 */
function payloadOf(count: number): { nodes: SceneNode[] } {
  const nodes: SceneNode[] = Array.from({ length: count }, (_unused, index) => ({
    ...meshNode(`node_${index}`),
    geometry: { kind: 'sphere', radius: 0.5, widthSegments: 32, heightSegments: 16 },
    material: { ...DEFAULT_MATERIAL, map: { assetId: 'asset_1' } },
  }))

  return { nodes }
}

describe('validating a document as it opens', () => {
  for (const count of [50, 500, 5_000, 10_000, 15_000, 50_000]) {
    const payload: unknown = JSON.parse(JSON.stringify(payloadOf(count)))
    bench(`${count} nodes`, () => {
      sceneFromPayload(payload)
    })
  }
})

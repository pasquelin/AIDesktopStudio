import { createDefaultScene } from '@/engines/scene/defaultScene'
import { modelNode } from '@/engines/scene/nodeFactory'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

const reopenCharacterMotion = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@/character/characterMotion', () => ({ reopenCharacterMotion }))

const DOCUMENT = 'doc-scene'
const ASSET = 'asset-hero'

describe('reopening a saved character motion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installFakeBridge()
  })

  it('reopens a motion asset on the named model timeline', async () => {
    const node = modelNode(ASSET, 'Hero')
    installScene(DOCUMENT, { ...createDefaultScene(), nodes: [node] })

    await expect(
      runAction('animation.reopenMotion', { nodeId: node.id, assetId: 'motion-run' }),
    ).resolves.toEqual({
      ok: true,
    })

    expect(reopenCharacterMotion).toHaveBeenCalledWith(DOCUMENT, node.id, 'motion-run')
  })
})

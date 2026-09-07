import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import type { SceneState } from '@/engines/scene/sceneState'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'
const scene = (): SceneState => sceneOf(useScenes.getState(), DOCUMENT)
const REFUSED = { ok: false, refusal: 'badInput' }

beforeEach(() => {
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
})

describe('the layers of the world', () => {
  it('refuses a list it cannot read whole, rather than wiping the layers it holds', async () => {
    await runAction('world.setLayers', { layers: [{ kind: 'scatter', id: 'trees' }] })

    expect(await runAction('world.setLayers', { layers: 'all' })).toMatchObject(REFUSED)
    expect(await runAction('world.setLayers', { layers: [{ kind: 'relief' }] })).toMatchObject(
      REFUSED,
    )
    expect(scene().world.layers).toMatchObject([{ kind: 'scatter', id: 'trees' }])
  })
})

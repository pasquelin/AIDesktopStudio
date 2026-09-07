import { animationGraphPreset } from '@shared/domain/animationPresets'
import { inputMapPreset } from '@shared/domain/inputPresets'
import { installFakeBridge } from '@/services/fakeBridge'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'

describe('project format assistant actions', () => {
  beforeEach(() => {
    installFakeBridge()
  })

  it('lists and reads project input maps and animation graphs', async () => {
    const map = inputMapPreset('character')
    const graph = animationGraphPreset('character')
    installFakeBridge({
      inputMaps: {
        list: async () => ['Controls/character.input.json'],
        read: async () => map,
      },
      animationGraphs: {
        list: async () => ['Animation/character.anim.json'],
        read: async () => graph,
      },
    })

    await expect(runAction('inputMaps.list', {})).resolves.toEqual({
      ok: true,
      data: ['Controls/character.input.json'],
    })
    await expect(
      runAction('inputMap.read', { path: 'Controls/character.input.json' }),
    ).resolves.toEqual({
      ok: true,
      data: map,
    })
    await expect(runAction('animationGraphs.list', {})).resolves.toEqual({
      ok: true,
      data: ['Animation/character.anim.json'],
    })
    await expect(
      runAction('animationGraph.read', { path: 'Animation/character.anim.json' }),
    ).resolves.toEqual({
      ok: true,
      data: graph,
    })
  })

  it('validates and writes input maps and animation graphs through the bridge', async () => {
    const writeMap = vi.fn(async () => true)
    const writeGraph = vi.fn(async () => true)
    const map = inputMapPreset('character')
    const graph = animationGraphPreset('character')
    installFakeBridge({ inputMaps: { write: writeMap }, animationGraphs: { write: writeGraph } })

    await expect(
      runAction('inputMap.write', { path: 'Controls/character.input.json', map }),
    ).resolves.toEqual({
      ok: true,
    })
    await expect(
      runAction('animationGraph.write', { path: 'Animation/character.anim.json', graph }),
    ).resolves.toEqual({ ok: true })

    expect(writeMap).toHaveBeenCalledWith('Controls/character.input.json', map)
    expect(writeGraph).toHaveBeenCalledWith('Animation/character.anim.json', graph)
    await expect(
      runAction('inputMap.write', { path: 'broken.input.json', map: {} }),
    ).resolves.toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

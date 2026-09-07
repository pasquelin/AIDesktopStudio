import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { SavePlayerModuleRequest } from '@shared/ipc'
import { playerModuleNodes } from '@/engines/scene/nodeFactory'
import { playerModuleFrom } from '@/engines/scene/playerModule'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { clearScenes, installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { fileModuleOf } from './fileModule'

const DOCUMENT = 'doc-1'

const filed = (path: string): Asset =>
  ({ id: 'asset-1', name: 'Player_Module', type: 'mesh', location: 'local', path }) as Asset

const nodesNow = () => sceneOf(useScenes.getState(), DOCUMENT).nodes

describe('filing a module as a glTF of its own', () => {
  beforeEach(() => {
    clearScenes()
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [...playerModuleNodes()] })
  })

  it('writes the module and marks the scene with the file it now comes from', async () => {
    const savePlayerModule = vi.fn((_request: SavePlayerModuleRequest) =>
      Promise.resolve(filed('modules/Player_Module.player.gltf')),
    )
    installFakeBridge({ assets: { savePlayerModule } })

    await fileModuleOf(DOCUMENT)

    expect(savePlayerModule).toHaveBeenCalledOnce()
    expect(playerModuleFrom(nodesNow())).toBe('modules/Player_Module.player.gltf')
  })

  /** What travels is the MODULE, never the scene around it — a file of five nodes, not of thirty. */
  it('writes the module alone, whatever else the scene holds', async () => {
    const savePlayerModule = vi.fn((_request: SavePlayerModuleRequest) =>
      Promise.resolve(filed('m.player.gltf')),
    )
    installFakeBridge({ assets: { savePlayerModule } })

    await fileModuleOf(DOCUMENT)

    const sent = savePlayerModule.mock.calls[0]?.[0]
    expect(JSON.parse(sent?.gltf ?? '{}').nodes).toHaveLength(playerModuleNodes().length)
  })

  it('does nothing at all for a scene that holds no module', async () => {
    installScene(DOCUMENT, EMPTY_SCENE)
    const savePlayerModule = vi.fn((_request: SavePlayerModuleRequest) =>
      Promise.resolve(filed('m.player.gltf')),
    )
    installFakeBridge({ assets: { savePlayerModule } })

    await fileModuleOf(DOCUMENT)

    expect(savePlayerModule).not.toHaveBeenCalled()
  })
})

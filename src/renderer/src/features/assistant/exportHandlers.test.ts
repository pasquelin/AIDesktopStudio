import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameExportRequest } from '@shared/domain/gameExport'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocument } from '@/stores/document-fixtures'
import { installScene } from '@/stores/scene-fixtures'
import { useProject } from '@/stores/project'
import { runAction } from './executor'
import { modelNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'

const { compileLossyModels } = vi.hoisted(() => ({
  compileLossyModels: vi.fn(async () => new Map()),
}))
vi.mock('@/engines/scene/lossyModelCompiler', () => ({ compileLossyModels }))
vi.mock('@/engines/scene/lossyTextureCompiler', () => ({
  compileLossyTextures: vi.fn(async () => []),
  compileLossyModelTextures: vi.fn(async () => []),
}))

const DOCUMENT = 'doc-1'

function exporting(answer: GameExportRequest['scenes'] extends never ? never : boolean = true) {
  const asked: GameExportRequest[] = []
  installFakeBridge({
    game: {
      export: request => {
        asked.push(request)
        return Promise.resolve(
          answer ? { folder: 'Demo', scenes: 1, scripts: 0, assets: 0, missing: [] } : null,
        )
      },
    },
  })
  return asked
}

describe('a game written out of the studio', () => {
  beforeEach(() => {
    installScene(DOCUMENT)
    installDocument(DOCUMENT, '3d')
    useProject.setState({
      project: { path: '/p', manifest: { name: 'Demo' } },
      known: true,
    } as never)
    vi.stubGlobal('Worker', class {} as never)
    compileLossyModels.mockReset()
    compileLossyModels.mockResolvedValue(new Map())
  })

  it('hands over every scene of the project, as the glTF a save writes', async () => {
    const asked = exporting()

    const outcome = await runAction('game.export', {})

    expect(outcome).toMatchObject({ ok: true, data: { folder: 'Demo' } })
    expect(asked[0]?.scenes.map(one => one.id)).toEqual([DOCUMENT])
    expect(String(asked[0]?.scenes[0]?.content)).toContain('asset')
    expect(asked[0]?.scenes[0]?.assetIds).toEqual([])
  })

  it('hands model assets to the package writer', async () => {
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [modelNode('tree-glb', 'Tree')] })
    const asked = exporting()

    await runAction('game.export', {})

    expect(asked[0]?.scenes[0]?.assetIds).toEqual(['tree-glb'])
  })

  it('attaches export-time generated model levels to their logical node', async () => {
    const node = modelNode('tree-glb', 'Tree')
    compileLossyModels.mockResolvedValueOnce(
      new Map([
        [
          'tree-glb',
          [
            {
              meshIndex: 0,
              lodMeshes: [{ encoding: 'float32-base64', position: '', normal: '', uv: '' }],
            },
          ],
        ],
      ]),
    )
    installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [node] })
    const asked = exporting()

    await runAction('game.export', { generateLods: true })

    expect(asked[0]?.scenes[0]?.optimization?.nodes).toContainEqual({
      nodeId: node.id,
      modelAssetId: 'tree-glb',
    })
    expect(asked[0]?.modelAssets).toEqual({
      'tree-glb': [
        {
          meshIndex: 0,
          lodMeshes: [{ encoding: 'float32-base64', position: '', normal: '', uv: '' }],
        },
      ],
    })
  })

  /** 🛑 A caller that named a scene and got the FIRST one exported the wrong game, saying `ok`. */
  it('refuses a scene the project does not hold rather than exporting another', async () => {
    exporting()

    expect(await runAction('game.export', { entryScene: 'Nowhere' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('refuses when nobody picked a folder', async () => {
    exporting(false)

    expect(await runAction('game.export', {})).toMatchObject({ ok: false, refusal: 'declined' })
  })

  /**
   * 🛑 With no folder named, the main process raises a system picker — which a caller on the wire
   * can neither fill in nor see. It stood on screen while the client counted its two minutes out.
   */
  it('refuses to raise a picker for a caller with no screen', async () => {
    const asked = exporting()

    expect(await runAction('game.export', {}, {})).toMatchObject({
      ok: false,
      refusal: 'nativeDialog',
    })
    expect(asked).toEqual([])
  })

  it('writes where that caller named, no picker involved', async () => {
    const asked = exporting()

    expect(await runAction('game.export', { folder: 'Builds' }, {})).toMatchObject({ ok: true })
    expect(asked[0]?.folder).toBe('Builds')
  })

  it('keeps visual changes off unless the caller explicitly names LOSSY choices', async () => {
    const asked = exporting()

    const safe = await runAction('game.export', {})

    expect(asked[0]?.lossyOptimization).toBeUndefined()
    expect(safe).toMatchObject({ ok: true, data: { visualChanges: 'NONE' } })
  })

  it('marks and forwards explicitly requested LOSSY choices', async () => {
    const asked = exporting()

    const outcome = await runAction('game.export', {
      generateLods: true,
      geometrySimplification: 'balanced',
      textureCompression: 'aggressive',
      textureReduction: 'half',
    })

    expect(asked[0]?.lossyOptimization).toEqual({
      generateLods: true,
      geometrySimplification: 'balanced',
      textureCompression: 'aggressive',
      textureReduction: 'half',
    })
    expect(outcome).toMatchObject({ ok: true, data: { visualChanges: 'POSSIBLE' } })
  })

  /** 🛑 `resources/gameRuntime` is git-ignored, so the main process throws where an assistant is
   * owed an answer. */
  it('answers a refusal when the main process throws instead of writing', async () => {
    installFakeBridge({
      game: {
        export: () =>
          Promise.reject(new Error('no game runtime is built: run `pnpm game:runtime`')),
      },
    })

    expect(await runAction('game.export', {})).toMatchObject({
      ok: false,
      refusal: 'failed',
      detail: expect.stringContaining('pnpm game:runtime'),
    })
  })
})

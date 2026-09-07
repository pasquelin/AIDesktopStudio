// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { createNodeOf } from '@/engines/scene/nodeFactory'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'
import { sceneOf, useScenes } from '@/stores/scenes'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'

const PLAN: OptimizationPlan = {
  classifications: [],
  instances: [],
  bakeCandidates: [],
  batches: [],
  merges: [],
  sharedGeometry: [],
  sharedMaterials: [],
  spatialCells: [],
  warnings: [],
  measured: {
    objects: 1,
    visibleObjects: 1,
    meshes: 1,
    draws: 1,
    triangles: 12,
    vertices: 24,
    geometryBytes: 96,
    textureBytes: 0,
    sharedMaterials: 0,
  },
  estimated: {
    drawCallsBefore: 1,
    drawCallsAfter: 1,
    avoidedGeometryBytes: 0,
    avoidedTextureBytes: 0,
  },
}

beforeEach(() => {
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
  installFakeBridge()
})

describe('optimizing the scene through the assistant', () => {
  it('uses the mounted analyzer for plans and measured reports', async () => {
    const analyzeOptimization = vi.fn(() => PLAN)
    const analyzeWorldOptimization = vi.fn(async () => PLAN)
    registerSceneEngine(DOCUMENT, {
      analyzeOptimization,
      analyzeWorldOptimization,
    } as unknown as SceneRenderer)

    expect(await runAction('optimization.analyze', {})).toEqual({ ok: true, data: PLAN })
    expect(await runAction('optimization.report', {})).toMatchObject({
      ok: true,
      data: { visualChanges: 'NONE' },
    })
    expect(analyzeWorldOptimization).toHaveBeenCalledTimes(2)
    forgetSceneEngine(DOCUMENT)
  })

  it('analyzes authoring state without requiring a mounted viewport', async () => {
    forgetSceneEngine(DOCUMENT)
    installScene(DOCUMENT, {
      ...createDefaultScene(),
      nodes: [createNodeOf('box')].filter(node => node !== null),
      selectedIds: [],
    })

    expect(await runAction('optimization.analyze', {})).toMatchObject({
      ok: true,
      data: { measured: { objects: 1, meshes: 1 } },
    })
  })

  it('refuses an unknown node id without raising a disposable analyzer', async () => {
    forgetSceneEngine(DOCUMENT)
    installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
    const apply = vi.spyOn(SceneRenderer.prototype, 'apply')

    expect(await runAction('optimization.analyze', { nodeIds: ['nowhere'] })).toMatchObject({
      ok: false,
    })
    expect(apply).not.toHaveBeenCalled()

    apply.mockRestore()
  })

  it('writes persisted overrides through undoable scene commands', async () => {
    const first = createNodeOf('box')
    const second = createNodeOf('sphere')
    if (!first || !second) throw new Error('optimization fixtures were not created')
    installScene(DOCUMENT, {
      ...createDefaultScene(),
      nodes: [first, second],
      selectedIds: [first.id],
    })

    expect(await runAction('optimization.selection', {})).toMatchObject({ ok: true })
    expect(await runAction('optimization.exclude', { nodeIds: [second.id] })).toMatchObject({
      ok: true,
    })
    useScenes.getState().undo(DOCUMENT)
    expect(
      await runAction('optimization.setMode', {
        nodeIds: [first.id],
        mode: 'batch',
      }),
    ).toMatchObject({ ok: true, data: { mode: 'batch' } })
    expect(await runAction('optimization.world', {})).toMatchObject({ ok: true })
    expect(
      sceneOf(useScenes.getState(), DOCUMENT).nodes.map(node => node.optimization?.mode),
    ).toEqual(['batch', 'auto'])
  })

  it('clears the disposable viewport cache', async () => {
    const clearOptimizationCache = vi.fn()
    registerSceneEngine(DOCUMENT, { clearOptimizationCache } as unknown as SceneRenderer)
    expect(await runAction('optimization.clearCache', {})).toEqual({ ok: true })
    expect(clearOptimizationCache).toHaveBeenCalledOnce()
    forgetSceneEngine(DOCUMENT)
  })
})

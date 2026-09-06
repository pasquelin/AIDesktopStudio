import type { AnimationGraphModule } from '@shared/domain/animationGraph'
import { graphsHeldForExport } from './animatedNodes'
import {
  hasVisualChanges,
  type GameExportOutcome,
  type GameExportRequest,
  type LossyOptimization,
} from '@shared/domain/gameExport'
import { projectName } from '@shared/domain/project'
import { assetMasterUrl, versionedUrl } from '@shared/domain/asset'
import { scenePayloadOf } from '@/features/shell/sceneDocument'
import { getBridge } from '@/services/bridge'
import { assetVersionOf } from '@/stores/assets'
import { documentsOfKind, sceneDocumentNamed, useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { compiledScripts } from '@/stores/play'
import { loadSceneSource, montageSceneOf } from '@/stores/sceneSources'
import { compileLossyWorldGeometry } from '@/engines/scene/lossyWorldCompiler'
import { renderPolicyOf } from '@shared/domain/renderPolicy'
import { useSettings } from '@/stores/settings'
import {
  compileLossyModelTextures,
  compileLossyTextures,
} from '@/engines/scene/lossyTextureCompiler'
import { compileLossyModels } from '@/engines/scene/lossyModelCompiler'
import { createCsgEvaluator } from '@/engines/csg/csgEvaluator'
import CsgWorker from '@/engines/csg/csg.worker?worker'
import { runtimeAssetIds, runtimeModelAssetIds, runtimeTextureAssetIds } from './runtimeAssetIds'
import { analyzeLossyWorld, type OptimizationPlan } from '@/engines/scene/worldAnalyzer'
import { runtimeArtifactsOf } from '@/engines/scene/runtimeWorldCompiler'
import { sceneEngineOf } from '@/stores/sceneEngines'
import type { SceneState } from '@/engines/scene/sceneState'

export type GameOptimizationEstimate = {
  scenes: number
  objects: number
  drawCallsBefore: number
  drawCallsAfter: number
}

type LoadedScene = {
  id: string
  title: string
  state: NonNullable<ReturnType<typeof montageSceneOf>>
}

/** Every scene of the project, read off disk if need be, with the montage state each holds. */
async function loadedScenes(): Promise<readonly LoadedScene[]> {
  const listed = documentsOfKind(useDocuments.getState(), 'scene')
  await Promise.all(listed.map(document => loadSceneSource(document.id)))
  return listed.flatMap(document => {
    const state = montageSceneOf(document.id)
    return state ? [{ id: document.id, title: document.title, state }] : []
  })
}

/**
 * What the whole project weighs, for the dialogue's second figure.
 *
 * `known` carries the plans the caller already measured — the dialogue holds the open scene's, and
 * measuring it a second time here ran two full analyses of the same scene on the one thread.
 */
export async function analyzeGameOptimization(
  known: Readonly<Record<string, OptimizationPlan>> = {},
): Promise<GameOptimizationEstimate> {
  const scenes = await loadedScenes()
  const inputs = await Promise.all(
    scenes.map(async ({ id, state }) => {
      const plan = known[id] ?? (await sceneEngineOf(id)?.analyzeWorldOptimization())
      return { state, ...(plan ? { plan } : {}) }
    }),
  )
  return gameOptimizationEstimate(inputs)
}

export function gameOptimizationEstimate(
  inputs: readonly {
    state: NonNullable<ReturnType<typeof montageSceneOf>>
    plan?: OptimizationPlan
  }[],
): GameOptimizationEstimate {
  const estimates = inputs.map(({ state, plan }) =>
    plan
      ? {
          objects: plan.measured.objects,
          drawCallsBefore: plan.estimated.drawCallsBefore,
          drawCallsAfter: plan.estimated.drawCallsAfter,
        }
      : estimateUnmountedScene(state),
  )
  return estimates.reduce<GameOptimizationEstimate>(
    (total, estimate) => ({
      scenes: total.scenes + 1,
      objects: total.objects + estimate.objects,
      drawCallsBefore: total.drawCallsBefore + estimate.drawCallsBefore,
      drawCallsAfter: total.drawCallsAfter + estimate.drawCallsAfter,
    }),
    { scenes: 0, objects: 0, drawCallsBefore: 0, drawCallsAfter: 0 },
  )
}

function estimateUnmountedScene(
  state: NonNullable<ReturnType<typeof montageSceneOf>>,
): Omit<GameOptimizationEstimate, 'scenes'> {
  const drawn = state.nodes.filter(node => node.visible && rendersIndividually(node.type))
  const artifacts = runtimeArtifactsOf(state.nodes, state.animation)
  const grouped = new Set(artifacts.flatMap(artifact => artifact.sourceIds))
  return {
    objects: state.nodes.length,
    drawCallsBefore: drawn.length,
    drawCallsAfter: drawn.filter(node => !grouped.has(node.id)).length + artifacts.length,
  }
}

function rendersIndividually(
  type: NonNullable<ReturnType<typeof montageSceneOf>>['nodes'][number]['type'],
): boolean {
  return (
    type === 'mesh' || type === 'model' || type === 'sprite' || type === 'text' || type === 'carved'
  )
}

export type GameExportFailure = 'noBridge' | 'noProject' | 'noScene' | 'unknownScene' | 'declined'

export type GameExportResult =
  | { ok: true; outcome: GameExportOutcome; troubles: readonly string[] }
  | { ok: false; reason: GameExportFailure }

export type GameExportOptions = {
  lossyOptimization: LossyOptimization
  entryScene?: string
  title?: string
  folder?: string
  signal?: AbortSignal
}

export async function exportGameProject(options: GameExportOptions): Promise<GameExportResult> {
  const project = useProject.getState().project
  const bridge = getBridge()
  if (!bridge) return { ok: false, reason: 'noBridge' }
  if (!project) return { ok: false, reason: 'noProject' }

  const projectScenes = await compileProjectScenes(options.lossyOptimization, options.signal)
  if (projectScenes.scenes.length === 0) return { ok: false, reason: 'noScene' }
  const named = options.entryScene ? sceneDocumentNamed(options.entryScene) : null
  const entry = named
    ? projectScenes.scenes.find(scene => scene.id === named)
    : projectScenes.scenes[0]
  if (!entry) return { ok: false, reason: 'unknownScene' }

  const { request, troubles } = await compileExportRequest(
    options,
    project.path,
    projectScenes,
    entry.id,
  )
  const outcome = await bridge.game.export(request)
  return outcome ? { ok: true, outcome, troubles } : { ok: false, reason: 'declined' }
}

async function compileExportRequest(
  options: GameExportOptions,
  projectPath: string,
  projectScenes: CompiledProjectScenes,
  entryScene: string,
): Promise<{ request: GameExportRequest; troubles: readonly string[] }> {
  const [compiled, textureOverrides, modelTextureOverrides] = await Promise.all([
    compiledScripts(),
    compileLossyTextures(projectScenes.textureAssetIds, options.lossyOptimization, {
      signal: options.signal,
    }),
    compileLossyModelTextures(projectScenes.modelAssetIds, options.lossyOptimization, {
      signal: options.signal,
    }),
  ])
  const request = exportRequestOf(
    options,
    projectPath,
    projectScenes,
    entryScene,
    compiled.modules,
    compiled.inputMaps,
    graphsHeldForExport(projectScenes.nodes, compiled.animationGraphs),
    [...textureOverrides, ...modelTextureOverrides],
  )
  return { request, troubles: compiled.troubles.map(trouble => trouble.script) }
}

function exportRequestOf(
  options: GameExportOptions,
  projectPath: string,
  projectScenes: CompiledProjectScenes,
  entryScene: string,
  modules: Awaited<ReturnType<typeof compiledScripts>>['modules'],
  inputMaps: Awaited<ReturnType<typeof compiledScripts>>['inputMaps'],
  animationGraphs: readonly AnimationGraphModule[],
  assetOverrides: GameExportRequest['assetOverrides'],
): GameExportRequest {
  return {
    title: options.title ?? projectName(projectPath),
    entryScene,
    scenes: projectScenes.scenes,
    scripts: modules.map(module => ({ script: module.script, code: module.code })),
    ...(inputMaps.length ? { inputMaps } : {}),
    ...(animationGraphs.length ? { animationGraphs } : {}),
    ...(Object.keys(projectScenes.modelAssets).length
      ? { modelAssets: projectScenes.modelAssets }
      : {}),
    ...(hasVisualChanges(options.lossyOptimization)
      ? { lossyOptimization: options.lossyOptimization }
      : {}),
    // 🛑 Carried rather than defaulted: a game drawn under another policy than the editor is the
    // same scene lit two ways, and nothing compared the two.
    render: renderPolicyOf(useSettings.getState().settings.three),
    ...(assetOverrides?.length ? { assetOverrides } : {}),
    ...(options.folder ? { folder: options.folder } : {}),
  }
}

type CompiledProjectScenes = {
  scenes: GameExportRequest['scenes']
  nodes: SceneState['nodes']
  textureAssetIds: readonly string[]
  modelAssets: NonNullable<GameExportRequest['modelAssets']>
  modelAssetIds: readonly string[]
}

async function compileProjectScenes(
  lossyOptimization: LossyOptimization,
  signal: AbortSignal | undefined,
): Promise<CompiledProjectScenes> {
  const loaded = await loadedScenes()
  const allNodes = loaded.flatMap(one => one.state.nodes)
  const modelAssetIds = runtimeModelAssetIds(allNodes)
  const modelPlans = await compileLossyModels(
    modelAssetIds.map(id => ({
      id,
      url: versionedUrl(assetMasterUrl(id), assetVersionOf(id)),
    })),
    lossyOptimization,
    // 🛑 No `onProgress`: both lossy compilers expose one and nothing draws it — declared hole.
    { signal },
  )
  const csg = createCsgEvaluator({ spawn: () => new CsgWorker(), onFailure: () => undefined })
  const abort = (): void => csg.dispose()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const scenes = await Promise.all(
      loaded.map(async ({ id, title, state }) => {
        const geometryPlan = await compileLossyWorldGeometry(
          state,
          lossyOptimization,
          csg.acquire,
          analyzeLossyWorld(state.nodes),
        )
        // No second exclusion test: a protected asset never entered `modelAssetIds`, so no plan
        // was compiled for it.
        const modelNodes = state.nodes.flatMap(node =>
          node.type === 'model' && modelPlans.has(node.model.assetId)
            ? [{ nodeId: node.id, modelAssetId: node.model.assetId }]
            : [],
        )
        const optimizedNodes = [...(geometryPlan?.nodes ?? []), ...modelNodes]
        const optimization = optimizedNodes.length > 0 ? { nodes: optimizedNodes } : undefined
        return {
          id,
          title,
          content: JSON.stringify(scenePayloadOf(state, id)),
          assetIds: runtimeAssetIds(state),
          ...(optimization ? { optimization } : {}),
        }
      }),
    )
    if (signal?.aborted) throw new DOMException('World compilation aborted', 'AbortError')
    return {
      scenes,
      nodes: allNodes,
      textureAssetIds: runtimeTextureAssetIds(allNodes),
      modelAssets: Object.fromEntries(modelPlans),
      modelAssetIds,
    }
  } finally {
    signal?.removeEventListener('abort', abort)
    csg.dispose()
  }
}

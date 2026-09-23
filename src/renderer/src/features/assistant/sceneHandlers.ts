import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { OPTIMIZATION_MODES, type OptimizationMode } from '@shared/domain/scene'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { setNodesOptimization } from '@/engines/scene/commands'
import { optimizationReport } from '@/engines/scene/worldAnalyzer'
import { dropCompiledScene } from '@/game/dropCompiledScene'
import { sceneEngineOf, sceneEngineSettled } from '@/stores/sceneEngines'
import { useScenes } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { oneOf, textsOf } from './actionInputs'
import { SCENE_CAMERA_VIEW_HANDLERS } from './sceneCameraViewHandlers'
import { aimedNodes, mounted, mountedScene, NO_SCENE, noSuchNode } from './sceneHandlerCore'
import { nodeTargets, selectNode } from './sceneNodeActions'
import { SCENE_NODE_APPEARANCE_HANDLERS } from './sceneNodeAppearanceHandlers'
import { SCENE_NODE_BASIC_HANDLERS } from './sceneNodeBasicHandlers'
import { readState } from './sceneStateHandler'
import { SCENE_WORLD_HANDLERS } from './sceneWorldHandlers'

export { mounted, NO_SCENE, nodeTargets, noSuchNode, selectNode }

async function optimizationAnalysis(
  input: Record<string, unknown>,
  reportOnly: boolean,
): Promise<ActionOutcome> {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_SCENE)
  // The plan is read off the mounted engine, which trails the store by a render — see
  // `sceneEngineSettled`. The engine built below when none is mounted is given the state itself.
  await sceneEngineSettled(open.documentId)
  const named = textsOf(input, 'nodeIds')
  const nodes = aimedNodes(open.state, input)
  if (nodes.length !== named.length)
    return refused('notFound', 'one or more requested scene nodes do not exist')

  // 🛑 Raised AFTER the refusal above: it returns without entering the `try`, so an engine built
  // over it was never disposed — one whole three.js scene leaked per unknown node id.
  const mountedEngine = sceneEngineOf(open.documentId)
  const engine = mountedEngine ?? new SceneRenderer({ onSelect: () => {}, onTransform: () => {} })
  if (!mountedEngine) engine.apply(open.state)
  try {
    const plan =
      named.length === 0
        ? await engine.analyzeWorldOptimization()
        : engine.analyzeOptimization(nodes.map(node => node.id))
    return { ok: true, data: reportOnly ? optimizationReport(plan) : plan }
  } finally {
    if (!mountedEngine) engine.dispose()
  }
}

function optimizeNodes(scope: 'selection' | 'world'): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open
  const candidates =
    scope === 'world'
      ? open.state.nodes
      : open.state.nodes.filter(node => open.state.selectedIds.includes(node.id))
  const nodes =
    scope === 'world'
      ? candidates.filter(node => !node.optimization || node.optimization.mode === 'auto')
      : candidates
  if (nodes.length === 0) return refused('badInput', `the ${scope} holds no node to optimize`)
  useScenes.getState().runCommand(open.documentId, setNodesOptimization(nodes, { mode: 'auto' }))
  return { ok: true, data: { nodeIds: nodes.map(node => node.id), mode: 'auto' } }
}

function setOptimizationMode(
  input: Record<string, unknown>,
  forced?: OptimizationMode,
): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open
  const named = textsOf(input, 'nodeIds')
  const nodes = aimedNodes(open.state, input)
  if (nodes.length !== named.length)
    return refused('notFound', 'one or more requested scene nodes do not exist')
  const mode = forced ?? oneOf(input, 'mode', OPTIMIZATION_MODES)
  if (!mode) return refused('badInput', `"mode" wants one of: ${OPTIMIZATION_MODES.join(', ')}`)
  useScenes.getState().runCommand(open.documentId, setNodesOptimization(nodes, { mode }))
  return { ok: true, data: { nodeIds: nodes.map(node => node.id), mode } }
}

export const SCENE_HANDLERS: ActionHandlers = {
  'scene.state': readState,
  'optimization.analyze': input => optimizationAnalysis(input, false),
  'optimization.report': input => optimizationAnalysis(input, true),
  'optimization.selection': () => optimizeNodes('selection'),
  'optimization.world': () => optimizeNodes('world'),
  'optimization.exclude': input => setOptimizationMode(input, 'exclude'),
  'optimization.setMode': input => setOptimizationMode(input),
  'optimization.clearCache': () => {
    const open = mounted()
    if (!open) return refused('wrongSurface', NO_SCENE)
    dropCompiledScene(open.documentId)
    return { ok: true }
  },
  ...SCENE_WORLD_HANDLERS,
  ...SCENE_NODE_BASIC_HANDLERS,
  ...SCENE_NODE_APPEARANCE_HANDLERS,
  ...SCENE_CAMERA_VIEW_HANDLERS,
}

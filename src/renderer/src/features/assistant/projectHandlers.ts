import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { clipKeyOf, CLIP_SOURCES } from '@shared/domain/scene'
import { inputMapOf } from '@shared/domain/inputMap'
import { animationGraphOf } from '@shared/domain/animationGraph'
import type { StudioBridge } from '@shared/ipc'
import { getBridge } from '@/services/bridge'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { clipFitOfNode, useModelFiles } from '@/stores/modelFiles'
import { sceneOf, useScenes } from '@/stores/scenes'
import { nodeAimed } from './nodeAimed'
import { oneOf, textOf } from './actionInputs'
import { withBridge, type ActionHandlers } from './actionHandler'

const NO_BRIDGE = 'this window is not connected to the studio process'

async function readPath(
  read: (bridge: StudioBridge, path: string) => Promise<unknown>,
  input: Record<string, unknown>,
): Promise<ActionOutcome> {
  const path = textOf(input, 'path') ?? ''
  const outcome = await withBridge(bridge => read(bridge, path))
  return outcome.ok && outcome.data === null
    ? refused('notFound', `nothing at input path "${path}" in the project`)
    : outcome
}

async function writePath<T>(
  write: (bridge: StudioBridge, path: string, value: T) => Promise<boolean>,
  input: Record<string, unknown>,
  key: string,
  parse: (value: unknown) => T,
): Promise<ActionOutcome> {
  const bridge = getBridge()
  if (!bridge) return refused('noBridge', NO_BRIDGE)
  let value: T
  try {
    value = parse(input[key])
  } catch (error) {
    return refused('badInput', error instanceof Error ? error.message : `invalid ${key}`)
  }
  const written = await write(bridge, textOf(input, 'path') ?? '', value)
  return written
    ? { ok: true }
    : refused('failed', `the project file "${textOf(input, 'path') ?? ''}" was not written`)
}

function retargetStatus(input: Record<string, unknown>): ActionOutcome {
  const source = oneOf(input, 'source', CLIP_SOURCES)
  const name = textOf(input, 'name')
  const assetId = textOf(input, 'assetId')
  if (!source || !name || (source === 'asset' && !assetId))
    return refused(
      'badInput',
      'asset motions require assetId; embedded and bundled motions use name',
    )

  const documentId = activeSceneId(useDocuments.getState())
  if (!documentId) return refused('wrongSurface', 'no scene is open')
  const nodeId = textOf(input, 'nodeId') ?? ''
  const node = nodeAimed(sceneOf(useScenes.getState(), documentId), nodeId)
  if (!node) return refused('notFound', `no scene node "${nodeId}" exists`)
  const fit = clipFitOfNode(
    useModelFiles.getState(),
    documentId,
    textOf(input, 'nodeId') ?? '',
    clipKeyOf(
      source === 'asset' ? { kind: source, assetId: assetId ?? '', name } : { kind: source, name },
    ),
  )
  return fit
    ? { ok: true, data: fit }
    : refused('notFound', 'retargeting has not been measured for this motion yet')
}

export const PROJECT_HANDLERS: ActionHandlers = {
  'inputMaps.list': () => withBridge(bridge => bridge.inputMaps.list()),
  'inputMap.read': input => readPath((bridge, path) => bridge.inputMaps.read(path), input),
  'inputMap.write': input =>
    writePath(
      (bridge, path, value) => bridge.inputMaps.write(path, value),
      input,
      'map',
      inputMapOf,
    ),
  'animationGraphs.list': () => withBridge(bridge => bridge.animationGraphs.list()),
  'animationGraph.read': input =>
    readPath((bridge, path) => bridge.animationGraphs.read(path), input),
  'animationGraph.write': input =>
    writePath(
      (bridge, path, value) => bridge.animationGraphs.write(path, value),
      input,
      'graph',
      animationGraphOf,
    ),
  'animation.retargetStatus': retargetStatus,
}

import { animationGraphOf, type AnimationGraphModule } from '@shared/domain/animationGraph'
import { isRecord } from '@shared/guards'
import type { RuntimeReport } from '@shared/domain/gameRuntime'
import type { ScriptModule } from '@game/ports/scriptPort'
import type { ScriptTrouble } from '@/engines/code/scriptCompiler'
import type { SceneState } from '@/engines/scene/sceneState'
import type { RuntimeWorldPatch } from '@/engines/scene/runtimeWorldCompiler'
import type { SceneLookup } from './playSession'
import { inputMapOf, type InputMap } from '@shared/domain/inputMap'

/**
 * What the studio and the game window say to each other. A `BroadcastChannel` and not the bridge,
 * for the reason `mirrorChannel` gives: both windows load the same bundle and already share these
 * types. The bridge keeps what only it can do — opening the window, closing it, saying it went.
 */
export type GameMessage =
  /** Play: the scene to run, and the project's scripts already transpiled. */
  | {
      kind: 'play'
      documentId: string
      scene: SceneState
      modules: readonly ScriptModule[]
      troubles: readonly ScriptTrouble[]
      inputMaps: readonly InputMap[]
      /** The state machines the project holds. A module naming none walks off the shipped preset. */
      animationGraphs: readonly AnimationGraphModule[]
    }
  /** The document was edited under a running game — `createStudioRender` follows it per frame. */
  | { kind: 'edit'; documentId: string; patch: RuntimeWorldPatch }
  /** The studio answering a `want`: what that name resolved to, in the game's own three values. */
  | { kind: 'scene'; scene: string; found: SceneLookup }
  /** Something to do to a running game, carrying the id its answer must quote. */
  | { kind: 'command'; id: number; command: GameCommand }
  /** The studio is going away: whatever is playing has nothing left to play for. */
  | { kind: 'gone' }
  /** Drops every compiled representation held for this authoring scene. */
  | { kind: 'clearOptimization'; documentId: string }
  /**
   * The game window asking for the game, which it must: a channel replays nothing, and the window
   * is opened AFTER the studio published. Without it the window sits on an empty scene.
   */
  | { kind: 'ask' }
  /** What the running game says about itself, six times a second — see `publish`. */
  | { kind: 'report'; documentId: string; report: RuntimeReport }
  /** A scene the game asked for by name, which only the studio's stores can resolve. */
  | { kind: 'want'; scene: string }
  /** The answer to one `command`: what `step` ran, and whether there was a game to run it on. */
  | { kind: 'done'; id: number; ok: boolean; ran: number }

export type GameCommand =
  | { name: 'pause' }
  | { name: 'resume' }
  | { name: 'stop' }
  | { name: 'step'; steps: number }
  | { name: 'loadScene'; scene: string; fade: number }

const CHANNEL = 'ai-desktop-studio.game'

/** Opens the channel. Both ends call this; each posts what the other listens for. */
export function openGameChannel(): BroadcastChannel {
  return new BroadcastChannel(CHANNEL)
}

export function clearGameOptimizationCache(documentId: string): void {
  const channel = openGameChannel()
  channel.postMessage({ kind: 'clearOptimization', documentId } satisfies GameMessage)
  channel.close()
}

/**
 * Fields, and NOT an array — which `isRecord` alone lets through. A `world` that arrives as `[]`
 * becomes the whole of `state.world`, and the first frame reads `background.kind` off it.
 */
const isFields = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && !Array.isArray(value)

type WireMessage = Record<string, unknown>
type Decoder = (data: WireMessage) => GameMessage | null

function playMessage(data: WireMessage): GameMessage | null {
  const { documentId, scene, modules = [], troubles = [] } = data
  const inputMaps = inputMapsOf(data.inputMaps ?? [])
  const animationGraphs = animationGraphsOf(data.animationGraphs ?? [])
  if (
    typeof documentId !== 'string' ||
    !isScene(scene) ||
    !Array.isArray(modules) ||
    !Array.isArray(troubles) ||
    inputMaps === null ||
    animationGraphs === null
  )
    return null
  return { kind: 'play', documentId, scene, modules, troubles, inputMaps, animationGraphs }
}

/** Read back through the parser, as the maps are: what crosses is data, never a trusted object. */
function animationGraphsOf(value: unknown): AnimationGraphModule[] | null {
  if (!Array.isArray(value)) return null
  try {
    return value.map(one => {
      if (!isFields(one) || typeof one.path !== 'string') throw new Error('unnamed graph')
      return { path: one.path, graph: animationGraphOf(one.graph) }
    })
  } catch {
    return null
  }
}

function inputMapsOf(value: unknown): InputMap[] | null {
  if (!Array.isArray(value)) return null
  try {
    return value.map(inputMapOf)
  } catch {
    return null
  }
}

function editMessage(data: WireMessage): GameMessage | null {
  const { documentId, patch } = data
  return typeof documentId === 'string' && isRuntimePatch(patch)
    ? { kind: 'edit', documentId, patch }
    : null
}

function isRuntimePatch(value: unknown): value is RuntimeWorldPatch {
  if (!isFields(value)) return false
  const { changedNodes, removedIds, order, world, animation } = value
  return (
    Array.isArray(changedNodes) &&
    changedNodes.every(isNode) &&
    Array.isArray(removedIds) &&
    removedIds.every(id => typeof id === 'string') &&
    (order === null || (Array.isArray(order) && order.every(id => typeof id === 'string'))) &&
    (world === null || isFields(world)) &&
    (animation === null || isFields(animation))
  )
}

const isNode = (value: unknown): boolean => isFields(value) && typeof value.id === 'string'

function sceneMessage(data: WireMessage): GameMessage | null {
  const { scene, found } = data
  if (typeof scene !== 'string') return null
  if (found === 'reading' || found === 'unknown') return { kind: 'scene', scene, found }
  if (!isFields(found)) return null
  const { state, document } = found
  return isScene(state) && typeof document === 'string'
    ? { kind: 'scene', scene, found: { state, document } }
    : null
}

function commandMessage(data: WireMessage): GameMessage | null {
  const { id, command } = data
  const asked = commandOf(command)
  return typeof id === 'number' && asked ? { kind: 'command', id, command: asked } : null
}

function reportMessage(data: WireMessage): GameMessage | null {
  const { documentId, report } = data
  return typeof documentId === 'string' && isReport(report)
    ? { kind: 'report', documentId, report }
    : null
}

function wantMessage(data: WireMessage): GameMessage | null {
  return typeof data.scene === 'string' ? { kind: 'want', scene: data.scene } : null
}

function doneMessage(data: WireMessage): GameMessage | null {
  const { id, ok, ran } = data
  return typeof id === 'number' && typeof ok === 'boolean' && typeof ran === 'number'
    ? { kind: 'done', id, ok, ran }
    : null
}

function clearOptimizationMessage(data: WireMessage): GameMessage | null {
  return typeof data.documentId === 'string'
    ? { kind: 'clearOptimization', documentId: data.documentId }
    : null
}

const DECODERS = new Map<string, Decoder>([
  ['ask', () => ({ kind: 'ask' })],
  ['gone', () => ({ kind: 'gone' })],
  ['play', playMessage],
  ['edit', editMessage],
  ['scene', sceneMessage],
  ['command', commandMessage],
  ['report', reportMessage],
  ['want', wantMessage],
  ['done', doneMessage],
  ['clearOptimization', clearOptimizationMessage],
])
/**
 * Reads a message off the wire, or nothing. A `BroadcastChannel` is reachable by anything on this
 * origin, so what arrives is checked — a window would else hand a stranger to a game runtime.
 */
export function gameMessageOf(data: unknown): GameMessage | null {
  if (!isFields(data) || typeof data.kind !== 'string') return null
  return DECODERS.get(data.kind)?.(data) ?? null
}

function commandOf(value: unknown): GameCommand | null {
  if (typeof value !== 'object' || value === null || !('name' in value)) return null
  if (value.name === 'pause' || value.name === 'resume' || value.name === 'stop') {
    return { name: value.name }
  }
  if (value.name === 'step' && 'steps' in value) {
    const { steps } = value
    return typeof steps === 'number' ? { name: 'step', steps } : null
  }
  if (value.name === 'loadScene' && 'scene' in value && 'fade' in value) {
    const { scene, fade } = value
    return typeof scene === 'string' && typeof fade === 'number'
      ? { name: 'loadScene', scene, fade }
      : null
  }
  return null
}

/** The shape a game runtime reads, checked at the depth it is read at — nodes and the animation. */
function isScene(value: unknown): value is SceneState {
  return isFields(value) && Array.isArray(value.nodes) && isFields(value.animation)
}

/** The shape the transport draws, checked at the depth it draws from. */
function isReport(value: unknown): value is RuntimeReport {
  return (
    isFields(value) &&
    (value.state === 'edit' || value.state === 'playing' || value.state === 'paused') &&
    Array.isArray(value.logs) &&
    Array.isArray(value.errors)
  )
}

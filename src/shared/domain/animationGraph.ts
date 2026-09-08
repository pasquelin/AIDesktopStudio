import { isRecord } from '../guards'
import { BODY_PARTS, WHOLE_BODY, type BodyPart } from './humanoid'
import {
  CLIP_SOURCES,
  isClipIndex,
  CLIP_SPEED,
  MAX_CLIP_FADE,
  ROOT_MOTIONS,
  type ClipSource,
  type RootMotion,
} from './sceneModel'

export const ANIMATION_GRAPH_VERSION = 1
export const ANIMATION_GRAPH_EXTENSION = '.anim.json'

/**
 * What a body is doing, published by the runtime on every step and readable by any condition.
 *
 * 🛑 They are what makes a shipped graph walk a character with nothing written by hand — a graph
 * declaring none of its own still has all of these to branch on. A parameter of the author's may
 * not take one of these names: which of the two a condition meant would be unanswerable.
 */
type BuiltInParameter =
  'speed' | 'forward' | 'strafe' | 'grounded' | 'airborne' | 'verticalSpeed' | 'jumped' | 'turning'

const BUILT_IN_PARAMETERS: Readonly<Record<BuiltInParameter, AnimationParameterKind>> = {
  /** Metres a second over the ground, whichever way the body is facing. */
  speed: 'number',
  /** Metres a second along the body's own heading, negative walking backwards. */
  forward: 'number',
  /** Metres a second across it, positive to the body's right. */
  strafe: 'number',
  grounded: 'boolean',
  /** Seconds since the ground was left, and zero while it is underfoot. */
  airborne: 'number',
  verticalSpeed: 'number',
  /** True on the single step a jump leaves the ground. */
  jumped: 'boolean',
  /** Radians a second the body is turning by, positive to its left. */
  turning: 'number',
}

type AnimationParameterKind = 'number' | 'boolean'

type AnimationParameter = { id: string; kind: AnimationParameterKind }

/**
 * A moment inside a clip that puts an event on the bus — a footstep, the frame a blow lands on.
 *
 * `at` is a FRACTION of the clip and never a time: the same marker then holds when the state is
 * played slower, and a clip swapped for a longer one keeps its footfalls where they were.
 */
type AnimationMarker = { id: string; at: number; name: string }

/**
 * One thing the body can be doing, and the clip it looks like.
 *
 * `speedFrom` names the parameter whose value MULTIPLIES `speed`, which is what keeps a walk
 * cycle under a body that walks at a pace the scene decides. Absent, `speed` stands alone.
 */
export type AnimationState = {
  id: string
  source: ClipSource
  loop: boolean
  speed: number
  speedFrom?: string
  rootMotion: RootMotion
  part?: BodyPart
  events?: readonly AnimationMarker[]
}

type ConditionOperator = '>' | '>=' | '<' | '<=' | '==' | '!='

const CONDITION_OPERATORS: readonly ConditionOperator[] = ['>', '>=', '<', '<=', '==', '!=']

/**
 * 🛑 Declarative, never an expression: this is read by the RUNTIME, which has no sandbox to
 * evaluate one in and must stay replayable step for step.
 */
export type AnimationCondition = {
  param: string
  op: ConditionOperator
  value: number | boolean
}

/**
 * One way out of a state. `from` empty means ANY state — the « Any State » of a graph, which is
 * how a jump interrupts whatever was playing.
 *
 * `exitTime` is a fraction of the clip before which the way out is refused: it is what makes a
 * landing finish rather than being cut off the instant the sticks move again.
 */
export type AnimationTransition = {
  from: string
  to: string
  fade: number
  when: readonly AnimationCondition[]
  exitTime?: number
  priority: number
}

/** One state machine. Several stack one day; this version plays the first and refuses a second. */
export type AnimationLayer = {
  id: string
  part: BodyPart
  initial: string
  states: readonly AnimationState[]
  transitions: readonly AnimationTransition[]
}

export type AnimationGraph = {
  version: number
  id: string
  parameters: readonly AnimationParameter[]
  layers: readonly AnimationLayer[]
}

export type AnimationGraphModule = { path: string; graph: AnimationGraph }

export function animationGraphOf(value: unknown): AnimationGraph {
  if (!isRecord(value)) throw new Error('animation graph must be an object')
  const { version, id, parameters, layers } = value
  if (version !== ANIMATION_GRAPH_VERSION) throw new Error('unsupported animation graph version')
  if (typeof id !== 'string' || id.length === 0) throw new Error('animation graph id is required')
  if (!Array.isArray(parameters)) throw new Error('animation parameters must be an array')
  if (!Array.isArray(layers)) throw new Error('animation layers must be an array')

  const declared = parameters.map(animationParameterOf)
  if (new Set(declared.map(one => one.id)).size !== declared.length)
    throw new Error('animation parameter ids must be unique')

  const kinds = parameterKinds(declared)
  // One layer, and the refusal is named: a second one would be played by nothing, and a graph
  // silently missing half of what it says is worse than one that will not open.
  if (layers.length !== 1) throw new Error('an animation graph holds exactly one layer')

  return { version, id, parameters: declared, layers: [animationLayerOf(layers[0], kinds)] }
}

/** Every name a condition may stand on, and what it holds — the built-ins under the author's. */
function parameterKinds(
  declared: readonly AnimationParameter[],
): ReadonlyMap<string, AnimationParameterKind> {
  const kinds = new Map<string, AnimationParameterKind>(Object.entries(BUILT_IN_PARAMETERS))
  for (const one of declared) {
    if (kinds.has(one.id)) throw new Error(`${one.id} is a built-in animation parameter`)
    kinds.set(one.id, one.kind)
  }
  return kinds
}

function animationParameterOf(value: unknown): AnimationParameter {
  if (!isRecord(value)) throw new Error('animation parameter must be an object')
  const { id, kind } = value
  if (typeof id !== 'string' || id.length === 0)
    throw new Error('animation parameter id is required')
  if (kind !== 'number' && kind !== 'boolean') throw new Error('invalid animation parameter kind')

  return { id, kind }
}

function animationLayerOf(
  value: unknown,
  kinds: ReadonlyMap<string, AnimationParameterKind>,
): AnimationLayer {
  if (!isRecord(value)) throw new Error('animation layer must be an object')
  const { id, initial, states, transitions } = value
  if (typeof id !== 'string' || id.length === 0) throw new Error('animation layer id is required')
  if (!Array.isArray(states) || states.length === 0)
    throw new Error('an animation layer holds at least one state')
  if (transitions !== undefined && !Array.isArray(transitions))
    throw new Error('animation transitions must be an array')

  const part = bodyPartOf(value.part)
  const parsed = states.map(one => animationStateOf(one, kinds))
  const ids = new Set(parsed.map(one => one.id))
  if (ids.size !== parsed.length) throw new Error('animation state ids must be unique')
  if (typeof initial !== 'string' || !ids.has(initial))
    throw new Error('an animation layer opens on one of its own states')

  return {
    id,
    part,
    initial,
    states: parsed,
    transitions: (transitions ?? []).map(one => animationTransitionOf(one, ids, kinds)),
  }
}

function animationStateOf(
  value: unknown,
  kinds: ReadonlyMap<string, AnimationParameterKind>,
): AnimationState {
  if (!isRecord(value)) throw new Error('animation state must be an object')
  const { id, speedFrom } = value
  if (typeof id !== 'string' || id.length === 0) throw new Error('animation state id is required')

  const speed = boundedNumber(value.speed ?? 1, CLIP_SPEED.min, CLIP_SPEED.max, 'animation speed')
  if (speedFrom !== undefined && kinds.get(String(speedFrom)) !== 'number')
    throw new Error('speedFrom must name a number parameter')

  const part = value.part === undefined ? undefined : bodyPartOf(value.part)
  const events = value.events === undefined ? undefined : animationMarkersOf(value.events)

  return {
    id,
    source: clipSourceOf(value.source),
    loop: value.loop !== false,
    speed,
    ...(speedFrom === undefined ? {} : { speedFrom: String(speedFrom) }),
    rootMotion: rootMotionOf(value.rootMotion),
    ...(part === undefined ? {} : { part }),
    ...(events === undefined ? {} : { events }),
  }
}

function animationMarkersOf(value: unknown): readonly AnimationMarker[] {
  if (!Array.isArray(value)) throw new Error('animation events must be an array')

  const markers = value.map((one): AnimationMarker => {
    if (!isRecord(one)) throw new Error('animation event must be an object')
    if (typeof one.id !== 'string' || one.id.length === 0)
      throw new Error('animation event id is required')
    if (typeof one.name !== 'string' || one.name.length === 0)
      throw new Error('animation event name is required')

    return { id: one.id, at: fraction(one.at, 'animation event position'), name: one.name }
  })

  if (new Set(markers.map(one => one.id)).size !== markers.length)
    throw new Error('animation event ids must be unique')
  return markers
}

function animationTransitionOf(
  value: unknown,
  states: ReadonlySet<string>,
  kinds: ReadonlyMap<string, AnimationParameterKind>,
): AnimationTransition {
  if (!isRecord(value)) throw new Error('animation transition must be an object')
  const { from, to, exitTime } = value
  // Empty is « from any state », which is a value and not an omission — see the type.
  const source = from === undefined ? '' : String(from)
  if (source !== '' && !states.has(source)) throw new Error(`unknown animation state ${source}`)
  if (typeof to !== 'string' || !states.has(to)) throw new Error('animation transition needs a to')

  const when = value.when === undefined ? [] : conditionsOf(value.when, kinds)
  // A way out on neither a condition nor a moment would be taken on the state's first step, and
  // the state it leaves would never be seen at all.
  if (when.length === 0 && exitTime === undefined)
    throw new Error('an animation transition needs a condition or an exitTime')

  return {
    from: source,
    to,
    fade: boundedNumber(value.fade ?? 0, 0, MAX_CLIP_FADE, 'animation fade'),
    when,
    ...(exitTime === undefined ? {} : { exitTime: fraction(exitTime, 'animation exitTime') }),
    priority: boundedNumber(value.priority ?? 0, -1000, 1000, 'animation priority'),
  }
}

function conditionsOf(
  value: unknown,
  kinds: ReadonlyMap<string, AnimationParameterKind>,
): readonly AnimationCondition[] {
  if (!Array.isArray(value)) throw new Error('animation conditions must be an array')

  return value.map((one): AnimationCondition => {
    if (!isRecord(one)) throw new Error('animation condition must be an object')
    const param = String(one.param)
    const kind = kinds.get(param)
    if (!kind) throw new Error(`unknown animation parameter ${param}`)
    if (!isConditionOperator(one.op)) throw new Error('invalid animation condition operator')

    if (kind === 'boolean') {
      // 🛑 An ordering on a switch answers whatever `false < true` happens to mean, and nobody
      // reading the file could say which way it went.
      if (one.op !== '==' && one.op !== '!=')
        throw new Error(`${param} is a switch and compares by == or !=`)
      if (typeof one.value !== 'boolean') throw new Error(`${param} compares against a switch`)
      return { param, op: one.op, value: one.value }
    }

    if (typeof one.value !== 'number' || !Number.isFinite(one.value))
      throw new Error(`${param} compares against a number`)
    return { param, op: one.op, value: one.value }
  })
}

function clipSourceOf(value: unknown): ClipSource {
  if (!isRecord(value)) throw new Error('animation state needs a clip')
  const { kind, name } = value
  if (!isClipKind(kind)) throw new Error('invalid clip source kind')
  if (typeof name !== 'string' || name.length === 0) throw new Error('clip source name is required')

  const clipIndex = value.clipIndex
  if (clipIndex !== undefined && !isClipIndex(clipIndex)) throw new Error('invalid clip index')
  if (kind === 'asset') {
    if (typeof value.assetId !== 'string' || value.assetId.length === 0)
      throw new Error('clip source assetId is required')
    return {
      kind: 'asset',
      assetId: value.assetId,
      name,
      ...(clipIndex !== undefined && { clipIndex }),
    }
  }
  return kind === 'bundled'
    ? { kind, name, ...(clipIndex !== undefined && { clipIndex }) }
    : { kind, name }
}

function rootMotionOf(value: unknown): RootMotion {
  // 🛑 `inPlace` and not `auto`: the character controller walks the body, and a clip left free to
  // travel moves it a second time.
  if (value === undefined) return 'inPlace'
  if (!isRootMotion(value)) throw new Error('invalid root motion')
  return value
}

function bodyPartOf(value: unknown): BodyPart {
  if (value === undefined) return WHOLE_BODY
  if (!isBodyPart(value)) throw new Error('invalid body part')
  return value
}

const CLIP_KINDS: ReadonlySet<string> = new Set(CLIP_SOURCES)
const ROOT_MOTION_SET: ReadonlySet<string> = new Set(ROOT_MOTIONS)
const BODY_PART_SET: ReadonlySet<string> = new Set(BODY_PARTS)
const OPERATOR_SET: ReadonlySet<string> = new Set(CONDITION_OPERATORS)

function isClipKind(value: unknown): value is ClipSource['kind'] {
  return typeof value === 'string' && CLIP_KINDS.has(value)
}

function isRootMotion(value: unknown): value is RootMotion {
  return typeof value === 'string' && ROOT_MOTION_SET.has(value)
}

function isBodyPart(value: unknown): value is BodyPart {
  return typeof value === 'string' && BODY_PART_SET.has(value)
}

function boundedNumber(value: unknown, low: number, high: number, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    throw new Error(`${what} must be between ${low} and ${high}`)
  return value
}

const fraction = (value: unknown, what: string): number => boundedNumber(value, 0, 1, what)

function isConditionOperator(value: unknown): value is ConditionOperator {
  return typeof value === 'string' && OPERATOR_SET.has(value)
}

import { isRecord, oneOf, readBoolean, readString } from '../guards'
import { bound } from '../numeric'
import { isVector3 } from './transform'
import {
  EXCLUSIVE,
  POST_EFFECTS,
  SLOT_RANK,
  isPostEffectId,
  type PostEffectId,
  type PostParamSpec,
  type PostParamValue,
  type PostSlot,
} from './postProcessingRegistry'

export * from './postProcessingRegistry'

/** One effect placed in a stack. `id` is the INSTANCE — what a keyframe aims at. */
export type PostEffect = {
  id: string
  effect: PostEffectId
  enabled: boolean
  params: Readonly<Record<string, PostParamValue>>
}

/**
 * An ordered composition. `enabled` is the ON/OFF the whole panel offers — turning it off leaves
 * every effect and every parameter exactly where they were, which is what makes it a comparison
 * rather than an edit.
 */
export type PostStack = {
  enabled: boolean
  effects: readonly PostEffect[]
}

export const EMPTY_STACK: PostStack = Object.freeze({ enabled: true, effects: [] })

/**
 * What a camera does with the scene's composition.
 *
 * Absent on every camera ever written, and absent means `inherit` — that IS the migration, and
 * `postOf` is the one place that says so.
 */
export type CameraPost =
  { mode: 'inherit' } | { mode: 'disabled' } | { mode: 'override'; stack: PostStack }

export type CameraPostMode = CameraPost['mode']

/** The stack a camera OWNS — `null` while it inherits the scene's or films through none. */
export function ownedStackOf(post: CameraPost | undefined): PostStack | null {
  return post?.mode === 'override' ? post.stack : null
}

export const CAMERA_POST_MODES: readonly CameraPostMode[] = ['inherit', 'override', 'disabled']

const INHERIT_POST: CameraPost = Object.freeze({ mode: 'inherit' })

/** The values a fresh instance of this effect opens on. */
export function defaultParamsOf(effect: PostEffectId): Record<string, PostParamValue> {
  return Object.fromEntries(
    Object.entries(POST_EFFECTS[effect].params).map(([key, spec]) => [key, spec.default]),
  )
}

export function postEffect(id: string, effect: PostEffectId): PostEffect {
  return { id, effect, enabled: true, params: defaultParamsOf(effect) }
}

/**
 * What the stack really runs, in the order it runs, and what it had to leave out.
 *
 * Pure, and it is where the rules that are not preferences live: the bands are ordered by slot
 * whatever the list says, and at most one effect of an EXCLUSIVE slot is honoured. The panel
 * reads `skipped` to say so, rather than leaving a switch that looks on and does nothing.
 */
export function planStack(stack: PostStack): PostPlan {
  const held = PLANS.get(stack)
  if (held) return held

  const made = planned(stack)
  PLANS.set(stack, made)
  return made
}

export type PostPlan = {
  effects: readonly PostEffect[]
  skipped: readonly PostEffect[]
  /** The shape a compiled chain is cached on — see `stackShapeKey`. */
  shapeKey: string
}

/**
 * Held on the stack's IDENTITY, which is what makes it safe: a stack is immutable and replaced by
 * a command, and `postAt` hands back the very same object when nothing drives it. Without this,
 * one composed frame planned three times per surface — fifteen times in a quad layout.
 */
const PLANS = new WeakMap<PostStack, PostPlan>()

function planned(stack: PostStack): PostPlan {
  if (!stack.enabled) return { effects: [], skipped: [], shapeKey: 'off' }

  const live = stack.effects.filter(one => one.enabled)
  const ordered = [...live].sort(
    (left, right) => SLOT_RANK[slotOf(left)] - SLOT_RANK[slotOf(right)],
  )

  const effects: PostEffect[] = []
  const skipped: PostEffect[] = []
  const taken = new Set<PostSlot>()

  for (const one of ordered) {
    const slot = slotOf(one)
    if (EXCLUSIVE.includes(slot)) {
      if (taken.has(slot)) {
        skipped.push(one)
        continue
      }
      taken.add(slot)
    }
    effects.push(one)
  }

  return { effects, skipped, shapeKey: effects.map(one => `${one.id}:${one.effect}`).join('|') }
}

export function slotOf(one: PostEffect): PostSlot {
  return POST_EFFECTS[one.effect].slot
}

/**
 * The shape of a stack, as one string — what a compiled pipeline is cached on.
 *
 * It reads the effects, their order and their switches, and **not one parameter**: moving a
 * slider must reach a uniform, never a rebuild. That single omission is what § 20 asks for.
 */
export function stackShapeKey(stack: PostStack): string {
  return planStack(stack).shapeKey
}

/** Whether a stack would draw anything at all — what tells a caller to take the direct path. */
export function stackDraws(stack: PostStack | null): stack is PostStack {
  return stack !== null && planStack(stack).effects.length > 0
}

/**
 * A parameter, held to what its spec allows. What an import runs every value through, and what a
 * command writes: a number outside its bounds is brought back rather than refused, and a value
 * of the wrong SHAPE falls back on the default.
 */
export function boundParam(spec: PostParamSpec, value: unknown): PostParamValue {
  if (spec.control === 'toggle') return typeof value === 'boolean' ? value : spec.default
  if (spec.control === 'color' || spec.control === 'asset') {
    return typeof value === 'string' ? value : spec.default
  }
  if (spec.control === 'choice') {
    return typeof spec.default === 'string'
      ? oneOf(spec.options, value, spec.default)
      : spec.default
  }
  if (spec.control === 'vector3') return isVector3(value) ? value : spec.default
  if (typeof value !== 'number' || !Number.isFinite(value)) return spec.default
  return bound(value, spec)
}

/**
 * The params of one effect, read back off something that came from disk: every key the effect
 * declares, filled from the payload where it is readable and from the default where it is not.
 *
 * Driven by the SPEC and never by the payload, which is the whole security of § 12: a file
 * naming a parameter no effect declares cannot introduce one.
 */
export function readParams(effect: PostEffectId, payload: unknown): Record<string, PostParamValue> {
  const source = isRecord(payload) ? payload : {}
  return Object.fromEntries(
    Object.entries(POST_EFFECTS[effect].params).map(([key, spec]) => [
      key,
      boundParam(spec, source[key]),
    ]),
  )
}

/**
 * A stack as the studio holds it, from a stack as a file spells it. Effects whose id the studio
 * does not know are DROPPED — see `unknownEffectsIn`, which names them so the import can say so.
 */
export function readStack(payload: unknown, mintId: () => string): PostStack {
  if (!isRecord(payload)) return EMPTY_STACK

  const listed = Array.isArray(payload.effects) ? payload.effects : []
  const effects = listed.flatMap((one: unknown): PostEffect[] => {
    if (!isRecord(one) || !isPostEffectId(one.effect)) return []
    return [
      {
        id: readString(one, 'id', '') || mintId(),
        effect: one.effect,
        enabled: readBoolean(one, 'enabled', true),
        params: readParams(one.effect, one.params),
      },
    ]
  })

  return { enabled: readBoolean(payload, 'enabled', true), effects }
}

/** The effect ids a payload names that this build has no effect for. What an import reports. */
export function unknownEffectsIn(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.effects)) return []

  const named = payload.effects.flatMap((one: unknown) =>
    isRecord(one) && typeof one.effect === 'string' && !isPostEffectId(one.effect)
      ? [one.effect]
      : [],
  )
  return [...new Set(named)]
}

/** A camera's composition as the file spells it. Anything unreadable comes back inheriting. */
export function readCameraPost(payload: unknown, mintId: () => string): CameraPost {
  if (!isRecord(payload)) return INHERIT_POST

  const mode = oneOf(CAMERA_POST_MODES, payload.mode, 'inherit')
  if (mode === 'disabled') return { mode: 'disabled' }
  if (mode === 'override') return { mode: 'override', stack: readStack(payload.stack, mintId) }
  return INHERIT_POST
}

/** Which composition a camera actually films through. `null` is « no post-processing at all ». */
export function postOf(scene: PostStack, camera: CameraPost | undefined): PostStack | null {
  if (!camera || camera.mode === 'inherit') return scene
  if (camera.mode === 'disabled') return null
  return camera.stack
}

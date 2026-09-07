// SPDX-License-Identifier: MIT

import type {
  AnimationCondition,
  AnimationLayer,
  AnimationState,
  AnimationTransition,
} from '@shared/domain/animationGraph'
import type { ClipSource } from '@shared/domain/sceneModel'
import type { PosedClip } from '../ports/animationPort'
import { clamp } from '../numeric'
import { pooled } from '../pooled'

/** What a body is doing, as the conditions of a graph read it. */
export type ParameterReading = Readonly<Record<string, number | boolean>>

/** How long each clip runs, by key — what the port answers, and what a length is missing from. */
export type ClipLengths = Readonly<Record<string, number>>

/**
 * Where one layer stands. Pure data, so a step replays: the same reading on the same state gives
 * the same next one, on every machine and in every session.
 */
export type AnimatorState = {
  state: string
  /** Seconds played inside the state's own clip, at the rate the state asks for. */
  time: number
  /** The state being left and its clock, for as long as the fade lasts. */
  from: { state: string; time: number } | null
  fade: number
  faded: number
  /** The markers already put on the bus for this pass through the clip. */
  fired: readonly string[]
  /** Whether a script forced this state, so the machine leaves it alone until it is let go. */
  forced: boolean
  /**
   * The any-state way in that is still true. While it holds, a second any-state of equal or
   * lower priority cannot pull the body back — a held bool would otherwise flip every tick.
   */
  via: HeldVia | null
}

/** The any-state transition that put the machine here, kept so it can hold the body. */
type HeldVia = {
  to: string
  priority: number
  when: readonly AnimationCondition[]
}

/** What crossing a step made happen, put on the bus by whoever ran the machine. */
type AnimationHappening =
  { kind: 'marker'; state: string; name: string } | { kind: 'finished'; state: string }

export type AnimationStep = { next: AnimatorState; happened: readonly AnimationHappening[] }

/**
 * The key a clip is filed under, wherever a player or a length is kept by name.
 *
 * 🛑 Copied from `clipKeyOf` of `@shared/domain/sceneModel` rather than imported: this tree ships
 * MIT and takes no VALUE from the studio's. `animationMachine.test.ts` holds the two together.
 */
export function clipKeyOf(source: ClipSource): string {
  if (source.kind === 'embedded') return source.name
  const key = source.kind === 'asset' ? `asset:${source.assetId}` : `bundled:${source.name}`
  return source.clipIndex ? `${key}:clip:${source.clipIndex}` : key
}

export function freshAnimator(layer: AnimationLayer): AnimatorState {
  return {
    state: layer.initial,
    time: 0,
    from: null,
    fade: 0,
    faded: 0,
    fired: [],
    forced: false,
    via: null,
  }
}

/**
 * One fixed step of one layer: the clock moves, then the ways out are weighed.
 *
 * `forced` names a state a script asked for on this very step, which wins over every transition —
 * and `letGo` hands a forced state back to the machine.
 */
export function advanceAnimator(
  layer: AnimationLayer,
  held: AnimatorState,
  reading: ParameterReading,
  lengths: ClipLengths,
  dt: number,
  asked?: { forced?: string; letGo?: boolean },
): AnimationStep {
  const happened: AnimationHappening[] = []
  const moved = played(layer, held, reading, lengths, dt, happened)

  const forced = asked?.forced
  if (forced !== undefined && stateOf(layer, forced))
    return { next: entered(moved, forced, 0, true), happened }

  const free = moved.forced && asked?.letGo === true ? { ...moved, forced: false } : moved
  // A forced state holds until it is let go, or until it plays out — a one-shot that kept the
  // body for ever would be a script that has to remember to release it.
  if (free.forced && !finishedIn(happened, free.state)) return { next: free, happened }

  const taken = wayOut(layer, free, reading, lengths)
  if (!taken) return { next: free.forced ? { ...free, forced: false } : free, happened }

  return {
    next: entered(free, taken.to, taken.fade, false, nextVia(free, reading, taken)),
    happened,
  }
}

/**
 * Every clip showing right now, the state being entered over the one being left.
 *
 * 🛑 Written INTO `clips` when one is given, which the animator reuses frame after frame — see
 * `pooled`, and the borrowing `AnimationPort.pose` spells out. Two clips at most, so the buffer
 * never grows past two.
 */
export function posedClipsOf(
  layer: AnimationLayer,
  held: AnimatorState,
  lengths: ClipLengths,
  clips: PosedClip[] = [],
): readonly PosedClip[] {
  const into = weightOf(held)
  let count = 0

  const leaving = held.from ? stateOf(layer, held.from.state) : null
  if (
    leaving &&
    held.from &&
    posedInto(clips, count, layer, leaving, held.from.time, 1 - into, lengths)
  )
    count += 1

  const playing = stateOf(layer, held.state)
  // The whole weight when nothing is being left: a lone clip must never show at a fraction.
  if (playing && posedInto(clips, count, layer, playing, held.time, count > 0 ? into : 1, lengths))
    count += 1

  clips.length = count
  return clips
}

/** How far into the fade the state being entered stands, from 0 to 1. */
function weightOf(held: AnimatorState): number {
  return held.from === null || held.fade <= 0 ? 1 : clamp(held.faded / held.fade, 0, 1)
}

/** Whether that state shows anything, having written it at `at` if it does. */
function posedInto(
  clips: PosedClip[],
  at: number,
  layer: AnimationLayer,
  state: AnimationState,
  time: number,
  weight: number,
  lengths: ClipLengths,
): boolean {
  const key = clipKeyOf(state.source)
  const length = lengths[key]
  // Not landed yet: the state holds and shows nothing, which is the contract a block already has.
  if (length === undefined || length <= 0) return false

  const held = pooled(clips, at, () => ({ ...NO_CLIP }))
  held.key = key
  held.time = state.loop ? time % length : Math.min(time, length)
  held.weight = weight
  held.part = state.part ?? layer.part
  held.rootMotion = state.rootMotion
  return true
}

/** What a pooled slot is born as, before the state above writes every one of its fields. */
const NO_CLIP: PosedClip = { key: '', time: 0, weight: 0, part: 'all', rootMotion: 'inPlace' }

/** The clock of both halves moved on, and what that crossed put in `happened`. */
function played(
  layer: AnimationLayer,
  held: AnimatorState,
  reading: ParameterReading,
  lengths: ClipLengths,
  dt: number,
  happened: AnimationHappening[],
): AnimatorState {
  const state = stateOf(layer, held.state)
  const rate = state ? rateOf(state, reading) : 1
  const time = held.time + dt * rate
  const fired = state ? crossed(state, held, time, lengths, happened) : held.fired

  const faded = held.faded + dt
  // The fade is over: what was being left stops being drawn at all, rather than lingering at a
  // weight nothing would ever bring back to zero.
  const from = held.from === null || faded >= held.fade ? null : { ...held.from }
  if (from) from.time += dt * rateOfState(layer, from.state, reading)

  return { ...held, time, fired, faded, from }
}

/** The markers this step went past, and the end of a clip that does not loop. */
function crossed(
  state: AnimationState,
  held: AnimatorState,
  time: number,
  lengths: ClipLengths,
  happened: AnimationHappening[],
): readonly string[] {
  const length = lengths[clipKeyOf(state.source)]
  if (length === undefined || length <= 0) return held.fired

  // A loop that came round starts firing again: the pass is over, and its footfalls are next
  // lap's. Measured against the lap, not the clock, so a clip played fast still fires each lap.
  const looped = state.loop && Math.floor(time / length) > Math.floor(held.time / length)
  const fired = looped ? NOTHING_FIRED : held.fired

  if (!state.loop && time >= length && held.time < length)
    happened.push({ kind: 'finished', state: state.id })

  const passed = state.loop ? (time % length) / length : Math.min(time, length) / length
  return marked(state, fired, passed, happened) ?? (looped ? [] : fired)
}

/**
 * The markers of this pass, or nothing when none was crossed.
 *
 * Copied only once something IS crossed: a state with no marker at all — which every state of the
 * shipped preset is — would otherwise allocate an array sixty times a second for nothing.
 */
function marked(
  state: AnimationState,
  fired: readonly string[],
  passed: number,
  happened: AnimationHappening[],
): string[] | null {
  let held: string[] | null = null
  for (const marker of state.events ?? []) {
    if ((held ?? fired).includes(marker.id) || passed < marker.at) continue
    held ??= [...fired]
    held.push(marker.id)
    happened.push({ kind: 'marker', state: state.id, name: marker.name })
  }
  return held
}

/** Shared and frozen: a lap that came round starts again from nothing, and so does every state. */
const NOTHING_FIRED: readonly string[] = Object.freeze([])

function rateOf(state: AnimationState, reading: ParameterReading): number {
  if (state.speedFrom === undefined) return state.speed

  const read = reading[state.speedFrom]
  const scale = typeof read === 'number' ? read : read === true ? 1 : 0
  // Never backwards and never wild: a negative rate would walk a clip's clock into the negatives,
  // where a modulo answers a time no clip holds.
  return clamp(state.speed * scale, 0, MAX_RATE)
}

/**
 * The same ceiling a block on the band is bounded by. 🛑 Copied from `CLIP_SPEED.max` rather than
 * imported — this tree takes no VALUE from the studio's — and held to it by the suite.
 */
export const MAX_RATE = 4

function rateOfState(layer: AnimationLayer, id: string, reading: ParameterReading): number {
  const state = stateOf(layer, id)
  return state ? rateOf(state, reading) : 1
}

/**
 * The way out this step takes, or nothing. Highest priority first, and the file's own order
 * between equals — an author reading top to bottom sees what the machine sees.
 */
function wayOut(
  layer: AnimationLayer,
  held: AnimatorState,
  reading: ParameterReading,
  lengths: ClipLengths,
): AnimationTransition | null {
  const locked = viaHolds(held, reading)
  let taken: AnimationTransition | null = null
  for (const transition of layer.transitions) {
    if (!opens(layer, transition, held, reading, lengths)) continue
    if (locked && transition.from === '' && transition.priority <= held.via.priority) continue
    if (taken === null || transition.priority > taken.priority) taken = transition
  }
  return taken
}

function viaHolds(
  held: AnimatorState,
  reading: ParameterReading,
): held is AnimatorState & { via: HeldVia } {
  const via = held.via
  if (!via || via.to !== held.state) return false
  for (const condition of via.when)
    if (!conditionHolds(condition, reading[condition.param])) return false
  return true
}

function viaOf(transition: AnimationTransition): HeldVia {
  return { to: transition.to, priority: transition.priority, when: transition.when }
}

/**
 * A fallback any-state taken because the previous lock lapsed is not itself a lock — otherwise
 * idle would hold the body against the next dance.
 */
function nextVia(
  held: AnimatorState,
  reading: ParameterReading,
  taken: AnimationTransition,
): HeldVia | null {
  if (taken.from !== '') return null
  if (held.via === null || viaHolds(held, reading)) return viaOf(taken)
  return null
}

function opens(
  layer: AnimationLayer,
  transition: AnimationTransition,
  held: AnimatorState,
  reading: ParameterReading,
  lengths: ClipLengths,
): boolean {
  // An « any state » way out onto the state already playing would be taken on every step, and
  // the clip would restart for ever without one frame of it ever being seen.
  if (transition.from === '' ? transition.to === held.state : transition.from !== held.state)
    return false
  if (transition.exitTime !== undefined && fractionOf(layer, held, lengths) < transition.exitTime)
    return false

  // A loop rather than `every`: a closure capturing the reading, allocated per transition and
  // per step, for a list that is almost always one condition long.
  for (const condition of transition.when)
    if (!conditionHolds(condition, reading[condition.param])) return false
  return true
}

/** How far through its clip the playing state stands. Zero while the clip has not landed. */
function fractionOf(layer: AnimationLayer, held: AnimatorState, lengths: ClipLengths): number {
  const state = stateOf(layer, held.state)
  const length = state ? lengths[clipKeyOf(state.source)] : undefined
  if (length === undefined || length <= 0) return 0

  return state?.loop ? (held.time % length) / length : clamp(held.time / length, 0, 1)
}

function entered(
  held: AnimatorState,
  to: string,
  fade: number,
  forced: boolean,
  via: HeldVia | null = null,
): AnimatorState {
  // Onto ITSELF is a restart, and it fades from nothing: a clip blended with its own earlier
  // frames reads as a body sliding rather than as a move beginning again.
  const from = to === held.state ? null : { state: held.state, time: held.time }
  return { state: to, time: 0, from, fade: from ? fade : 0, faded: 0, fired: [], forced, via }
}

const stateOf = (layer: AnimationLayer, id: string): AnimationState | undefined =>
  layer.states.find(state => state.id === id)

const finishedIn = (happened: readonly AnimationHappening[], state: string): boolean =>
  happened.some(one => one.kind === 'finished' && one.state === state)

/**
 * Whether a condition holds against a reading. A parameter nobody wrote reads as nothing rather
 * than refusing: a graph may name one the scene has no controller to publish.
 */
export function conditionHolds(
  condition: AnimationCondition,
  read: number | boolean | undefined,
): boolean {
  const held = read ?? (typeof condition.value === 'boolean' ? false : 0)
  if (typeof condition.value === 'boolean') {
    const on = held === true
    return condition.op === '!=' ? on !== condition.value : on === condition.value
  }

  const value = typeof held === 'number' ? held : held ? 1 : 0
  if (condition.op === '>') return value > condition.value
  if (condition.op === '>=') return value >= condition.value
  if (condition.op === '<') return value < condition.value
  if (condition.op === '<=') return value <= condition.value
  return condition.op === '==' ? value === condition.value : value !== condition.value
}

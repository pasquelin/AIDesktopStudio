/**
 * Every edit a composition can take, as commands. They all come down to reading one stack,
 * changing it and writing it back; which stack is the caller's, and the only thing that varies.
 */
import {
  defaultParamsOf,
  postEffect,
  POST_EFFECTS,
  boundParam,
  type CameraPost,
  type CameraPostMode,
  type PostEffectId,
  type PostParamValue,
  type PostStack,
} from '@shared/domain/postProcessing'
import { drivesPost, SCENE_SUBJECT_ID, type AnimationTrack } from '@shared/domain/animation'
import {
  isPostPresetId,
  postPresetNamed,
  stackFromPreset,
  type UserPostPreset,
} from '@shared/domain/postPresets'
import { inOrder, movedWithin } from '@shared/domain/order'
import type { CameraDescriptor } from '@shared/domain/scene'
import type { Us } from '@shared/domain/time'
import {
  addAnimationTrack,
  removeAnimationKey,
  removeAnimationTrack,
  setAnimationKey,
} from './animationCommands'
import { multi } from './commands'
import type { Command } from '../core/history'
import { newId } from '@/helpers/ids'
import type { SceneNode, SceneState } from './sceneState'

/** Whose composition is being edited. A camera only owns one while it is overriding. */
export type PostTargetRef = { kind: 'scene' } | { kind: 'camera'; nodeId: string }

export const SCENE_POST: PostTargetRef = Object.freeze({ kind: 'scene' })

/**
 * The stack a target owns, `null` when it owns none. Not an error: it tells the panel to edit
 * the SCENE instead, which is what « inherit » means when a hand reaches for a slider.
 */
export function postStackOf(state: SceneState, target: PostTargetRef): PostStack | null {
  if (target.kind === 'scene') return state.world.post

  const node = state.nodes.find(candidate => candidate.id === target.nodeId)
  if (node?.type !== 'camera') return null
  return node.camera.post?.mode === 'override' ? node.camera.post.stack : null
}

/** Spelled out rather than inferred: `as const` is refused, and a widened `mode` breaks the union. */
const overriding = (stack: PostStack): CameraPost => ({ mode: 'override', stack })

function writeStack(state: SceneState, target: PostTargetRef, stack: PostStack): SceneState {
  if (target.kind === 'scene') return { ...state, world: { ...state.world, post: stack } }

  return {
    ...state,
    nodes: state.nodes.map(node =>
      node.id === target.nodeId && node.type === 'camera'
        ? { ...node, camera: { ...node.camera, post: overriding(stack) } }
        : node,
    ),
  }
}

/**
 * The `id` is not decoration: the history may coalesce two consecutive commands on it, so a
 * slider drag has to be named after the parameter it moves.
 */
function editStack(
  target: PostTargetRef,
  id: string,
  change: (stack: PostStack) => PostStack,
): Command<SceneState> {
  let previous: PostStack | null = null

  return {
    id,
    refuses: state => postStackOf(state, target) === null,
    apply: state => {
      const held = postStackOf(state, target)
      if (!held) return state
      previous = held
      return writeStack(state, target, change(held))
    },
    revert: state => (previous ? writeStack(state, target, previous) : state),
  }
}

const handleOf = (target: PostTargetRef): string =>
  target.kind === 'scene' ? 'scene' : target.nodeId

export function addPostEffect(
  target: PostTargetRef,
  effect: PostEffectId,
  id = newId(),
): Command<SceneState> {
  return editStack(target, `post:add:${handleOf(target)}`, stack => ({
    ...stack,
    effects: [...stack.effects, postEffect(id, effect)],
  }))
}

export function removePostEffect(target: PostTargetRef, effectId: string): Command<SceneState> {
  return editStack(target, `post:remove:${handleOf(target)}:${effectId}`, stack => ({
    ...stack,
    effects: stack.effects.filter(one => one.id !== effectId),
  }))
}

/** Refused where a second instance means nothing — one anti-aliaser, one occlusion. */
export function duplicatePostEffect(
  target: PostTargetRef,
  effectId: string,
  id = newId(),
): Command<SceneState> {
  return editStack(target, `post:duplicate:${handleOf(target)}:${effectId}`, stack => {
    const at = stack.effects.findIndex(one => one.id === effectId)
    const held = stack.effects[at]
    if (!held || !POST_EFFECTS[held.effect].duplicable) return stack

    const effects = [...stack.effects]
    effects.splice(at + 1, 0, { ...held, id })
    return { ...stack, effects }
  })
}

/** Moved by places within its own list — `by` is negative to move earlier in the chain. */
export function movePostEffect(
  target: PostTargetRef,
  effectId: string,
  by: number,
): Command<SceneState> {
  return editStack(target, `post:move:${handleOf(target)}:${effectId}`, stack => {
    const order = movedWithin(
      stack.effects.map(one => one.id),
      effectId,
      by,
    )
    return { ...stack, effects: inOrder(stack.effects, order) }
  })
}

/** The whole list, reordered by a drag. The ids the caller names, in the order it names them. */
export function reorderPostEffects(
  target: PostTargetRef,
  order: readonly string[],
): Command<SceneState> {
  return editStack(target, `post:reorder:${handleOf(target)}`, stack => ({
    ...stack,
    effects: inOrder(stack.effects, order),
  }))
}

export function setPostEffectEnabled(
  target: PostTargetRef,
  effectId: string,
  enabled: boolean,
): Command<SceneState> {
  return editStack(target, `post:enabled:${handleOf(target)}:${effectId}`, stack => ({
    ...stack,
    effects: stack.effects.map(one => (one.id === effectId ? { ...one, enabled } : one)),
  }))
}

/** The composition's own switch — Before/After, and an edit ⌘Z takes back. */
export function setPostEnabled(target: PostTargetRef, enabled: boolean): Command<SceneState> {
  return editStack(target, `post:switch:${handleOf(target)}`, stack => ({ ...stack, enabled }))
}

/** Held to the spec of its own effect: a command is never how an impossible number gets in. */
export function setPostParam(
  target: PostTargetRef,
  effectId: string,
  param: string,
  value: PostParamValue,
): Command<SceneState> {
  return editStack(target, `post:param:${handleOf(target)}:${effectId}:${param}`, stack => ({
    ...stack,
    effects: stack.effects.map(one => {
      const spec = one.id === effectId ? POST_EFFECTS[one.effect].params[param] : undefined
      return spec ? { ...one, params: { ...one.params, [param]: boundParam(spec, value) } } : one
    }),
  }))
}

/** One effect back to what a fresh one of its kind holds. */
export function resetPostEffect(target: PostTargetRef, effectId: string): Command<SceneState> {
  return editStack(target, `post:reset:${handleOf(target)}:${effectId}`, stack => ({
    ...stack,
    effects: stack.effects.map(one =>
      one.id === effectId ? { ...one, params: defaultParamsOf(one.effect) } : one,
    ),
  }))
}

/**
 * COPIED under fresh instance ids: one saved look applied to the scene and to a camera would
 * otherwise share ids, and a channel keyed on one would drive both. The switch stays the
 * person's — a look applied while the comparison is off must not turn it back on.
 */
export function applyPostStack(
  target: PostTargetRef,
  stack: PostStack,
  mintId: () => string = newId,
): Command<SceneState> {
  const fresh = copiedStack(stack, mintId)
  return editStack(target, `post:stack:${handleOf(target)}`, held => ({
    ...fresh,
    enabled: held.enabled,
  }))
}

/**
 * Here rather than in the panel: which of the two lists a name belongs to is a rule about
 * presets, and a rule written in a click handler is one no test reaches.
 *
 * 🛑 IDS FIRST, both families, and only then a saved preset by NAME. The picker hands an id for
 * either list, so a look somebody saved as « Film noir » must not swallow the shipped `noir` row
 * standing right above it — while a client, which has only words, still reaches its own by name.
 */
export function stackOfPreset(
  name: string,
  saved: readonly UserPostPreset[],
  mintId: () => string = newId,
): PostStack | null {
  const byId = saved.find(preset => preset.id === name)
  if (byId) return byId.stack
  if (isPostPresetId(name)) return stackFromPreset(name, mintId)

  const byName = postPresetNamed(saved, name)
  return byName ? byName.stack : null
}

/**
 * Going to `override` SEEDS the camera with what it was already filming, under fresh instance
 * ids: one starts from the picture in front of them, and a channel keyed on the scene must not
 * silently drive the camera's copy.
 */
export function setCameraPostMode(
  state: SceneState,
  nodeId: string,
  mode: CameraPostMode,
  mintId: () => string = newId,
): Command<SceneState> {
  const node = state.nodes.find(candidate => candidate.id === nodeId)
  const held = node?.type === 'camera' ? node.camera.post : undefined
  const seed: PostStack =
    held?.mode === 'override' ? held.stack : copiedStack(state.world.post, mintId)

  let previous: SceneNode | null = null

  return {
    id: `post:mode:${nodeId}`,
    refuses: candidate => {
      const found = candidate.nodes.find(one => one.id === nodeId)
      return found?.type !== 'camera' || (found.camera.post?.mode ?? 'inherit') === mode
    },
    apply: candidate => writeMode(candidate, nodeId, mode, seed, taken => (previous = taken)),
    revert: candidate => {
      const taken = previous
      if (!taken) return candidate
      return { ...candidate, nodes: candidate.nodes.map(one => (one.id === nodeId ? taken : one)) }
    },
  }
}

function writeMode(
  state: SceneState,
  nodeId: string,
  mode: CameraPostMode,
  seed: PostStack,
  remember: (node: SceneNode) => void,
): SceneState {
  return {
    ...state,
    nodes: state.nodes.map(node => {
      if (node.id !== nodeId || node.type !== 'camera') return node
      remember(node)

      if (mode === 'inherit') {
        // The field is DROPPED rather than written as `inherit`: absent already means it, and a
        // file that spells it out is a file that grew for nothing.
        return { ...node, camera: withoutPost(node.camera) }
      }
      return {
        ...node,
        camera: {
          ...node.camera,
          post: mode === 'disabled' ? DISABLED_POST : overriding(seed),
        },
      }
    }),
  }
}

const DISABLED_POST: CameraPost = Object.freeze({ mode: 'disabled' })

/**
 * The lens without its composition. `inherit` is what an ABSENT field already means, so it is
 * dropped rather than written out — a file that spells it is a file that grew for nothing.
 */
function withoutPost(camera: CameraDescriptor): CameraDescriptor {
  const lens = { ...camera }
  delete lens.post
  return lens
}

/** The same composition under fresh instance ids — see `setCameraPostMode`. */
function copiedStack(stack: PostStack, mintId: () => string = newId): PostStack {
  return { ...stack, effects: stack.effects.map(one => ({ ...one, id: mintId() })) }
}

/** A camera answers to its own id; the scene's composition to the reserved `SCENE_SUBJECT_ID`. */
export function postSubjectOf(target: PostTargetRef): string {
  return target.kind === 'scene' ? SCENE_SUBJECT_ID : target.nodeId
}

/** The channel driving one parameter of one effect, if a hand has opened it. */
export function postChannelOf(
  state: SceneState,
  target: PostTargetRef,
  effectId: string,
  param: string,
): AnimationTrack | undefined {
  const subject = postSubjectOf(target)
  return state.animation.tracks.find(
    track =>
      track.target.nodeId === subject &&
      drivesPost(track.target) &&
      track.target.post.effectId === effectId &&
      track.target.post.param === param,
  )
}

/**
 * Takes the ABSOLUTE value the panel shows and writes the DELTA, as a lens key does. Opens the
 * channel where none exists. `null` where there is nothing to key.
 */
export function keyPostParam(
  state: SceneState,
  target: PostTargetRef,
  effectId: string,
  param: string,
  time: Us,
  value: number,
  name: string,
  mintId: () => string = newId,
): Command<SceneState> | null {
  const stack = postStackOf(state, target)
  const effect = stack?.effects.find(one => one.id === effectId)
  const spec = effect ? POST_EFFECTS[effect.effect].params[param] : undefined
  const base = effect?.params[param]
  if (!spec?.animatable || typeof base !== 'number') return null

  const delta = { x: value - base, y: 0, z: 0 }
  const held = postChannelOf(state, target, effectId, param)
  if (held) return setAnimationKey(held.id, time, delta)

  const trackId = mintId()
  return multi(`post:key:${effectId}:${param}`, [
    addAnimationTrack(
      { nodeId: postSubjectOf(target), property: 'post', post: { effectId, param } },
      name,
      trackId,
    ),
    setAnimationKey(trackId, time, delta),
  ])
}

/** Takes the key back off a composition channel at that instant. */
export function unkeyPostParam(
  state: SceneState,
  target: PostTargetRef,
  effectId: string,
  param: string,
  time: Us,
): Command<SceneState> | null {
  const held = postChannelOf(state, target, effectId, param)
  return held ? removeAnimationKey(held.id, time) : null
}

/**
 * Channels go with the effect: left behind they drive an instance nobody can reach, and a ⌘Z
 * bringing the effect back would find its animation gone.
 */
export function removePostEffectWholly(
  state: SceneState,
  target: PostTargetRef,
  effectId: string,
): Command<SceneState> {
  const subject = postSubjectOf(target)
  const doomed = state.animation.tracks.filter(
    track =>
      track.target.nodeId === subject &&
      drivesPost(track.target) &&
      track.target.post.effectId === effectId,
  )

  return multi(`post:remove:${handleOf(target)}:${effectId}`, [
    ...doomed.map(track => removeAnimationTrack(track.id)),
    removePostEffect(target, effectId),
  ])
}

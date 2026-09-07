import {
  boundParam,
  CAMERA_POST_MODES,
  isPostEffectId,
  planStack,
  POST_EFFECTS,
  type PostStack,
} from '@shared/domain/postProcessing'
import { POST_PRESET_IDS, postPresetNamed, type UserPostPreset } from '@shared/domain/postPresets'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import type { Command } from '@/engines/core/history'
import {
  addPostEffect,
  applyPostStack,
  duplicatePostEffect,
  keyPostParam,
  resetPostEffect,
  stackOfPreset,
  unkeyPostParam,
  movePostEffect,
  postStackOf,
  removePostEffectWholly,
  setCameraPostMode,
  setPostEffectEnabled,
  setPostEnabled,
  setPostParam,
  type PostTargetRef,
} from '@/engines/scene/postCommands'
import type { SceneState } from '@/engines/scene/sceneState'
import { speaksBundle } from '@/helpers/speaksBundle'
import type { Us } from '@shared/domain/time'
import { postChannelName } from '@/helpers/channelNames'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { newId } from '@/helpers/ids'
import { usePostPresets } from '@/stores/postPresets'
import { useScenes } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { maybeBoolOf, numberOf, oneOf, textOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'
import { mounted, NO_SCENE } from './sceneHandlers'
import { mountedScene } from './sceneHandlerCore'

/**
 * The composition, driven by value. Nothing here knows what a bloom is: both the effect and the
 * parameter are checked against `POST_EFFECTS`, so a call naming a knob that does not exist is
 * refused rather than writing a field nothing reads.
 *
 * 🛑 The one gesture of the panel with no action here is the FILE — `post.export` and
 * `post.import` open a native dialog, which waits on somebody at the screen. Nothing is out of
 * reach for all that: `post.state` reads a whole stack out and `post.add`/`post.set` build one
 * back, and `post.save` keeps a look on this machine without a file at all.
 */

/**
 * Which composition a call names, or why none can be found.
 *
 * `inherit` answers the SCENE's, and that is not a shortcut: asking a camera that inherits to
 * change a bloom IS asking the scene to. `disabled` is the opposite case and must never fall the
 * same way — a camera filming through nothing has no stack to edit, and answering the scene's
 * would rewrite what every OTHER camera shows while leaving the named one exactly as it was.
 */
type PostLookup = PostTargetRef | 'unknown' | 'disabled'

function targetOf(input: Record<string, unknown>, state: SceneState): PostLookup {
  const named = textOf(input, 'cameraId')
  if (named === null) return { kind: 'scene' }

  // By id OR by name, like every other node-facing action of the registry — a client that can
  // say « Camera 01 » everywhere else must not have to find an id here.
  const node = nodeAimed(state, named)
  if (node?.type !== 'camera') return 'unknown'

  const mode = node.camera.post?.mode
  if (mode === 'override') return { kind: 'camera', nodeId: node.id }
  return mode === 'disabled' ? 'disabled' : { kind: 'scene' }
}

/** The refusal a lookup that found no composition hands back, spelled once for both callers. */
function lookupRefusal(lookup: 'unknown' | 'disabled'): ActionOutcome {
  return lookup === 'unknown'
    ? refused('notFound', 'no camera of that id in the scene in front')
    : refused(
        'badInput',
        'that camera composes through nothing: set its post mode to override or inherit first',
      )
}

/** The composition a call names, with the scene it belongs to — or the refusal that stands. */
function withStack(
  input: Record<string, unknown>,
  answer: (found: {
    target: PostTargetRef
    stack: PostStack
    state: SceneState
    documentId: string
  }) => ActionOutcome,
): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const target = targetOf(input, open.state)
  if (typeof target === 'string') return lookupRefusal(target)

  const stack = postStackOf(open.state, target)
  if (!stack)
    return refused(
      'notFound',
      'nothing here owns a composition to edit — post.state answers who owns the one in force',
    )

  return answer({ target, stack, state: open.state, documentId: open.documentId })
}

/** One edit of the composition a call names, run on the scene in front. */
function editPost(
  input: Record<string, unknown>,
  build: (target: PostTargetRef, stack: PostStack, state: SceneState) => Command<SceneState> | null,
  /** What a caller does when the composition IS found and the build still declines. */
  nothing: string,
): ActionOutcome {
  return withStack(input, ({ target, stack, state, documentId }) => {
    const command = build(target, stack, state)
    if (!command) return refused('badInput', nothing)

    useScenes.getState().runCommand(documentId, command)
    return { ok: true }
  })
}

/** Where the head of the scene in front stands. Read at CALL time: playback moves it. */
function headAt(): Us {
  const open = mounted()
  return open ? sceneKeyingAt(open.documentId).at : 0
}

const savedPresets = (): readonly UserPostPreset[] => usePostPresets.getState().saved

const savedNamed = (named: string): UserPostPreset | undefined =>
  postPresetNamed(savedPresets(), named)

/** The instance a call names, checked against the stack it claims to be in. */
function effectIn(stack: PostStack, input: Record<string, unknown>): string | null {
  const effectId = textOf(input, 'effectId') ?? ''
  return stack.effects.some(one => one.id === effectId) ? effectId : null
}

export const POST_HANDLERS: ActionHandlers = {
  /** The ids of the instances, what each one is, and which of them the plan actually runs. */
  'post.state': input => {
    const open = mounted()
    if (!open) return refused('wrongSurface', NO_SCENE)

    const target = targetOf(input, open.state)
    // A READ, so a camera composing through nothing is answered rather than refused — with the
    // truth, which is an empty stack. Handing back the scene's would name effects that camera
    // does not run.
    if (target === 'disabled')
      return { ok: true, data: { owner: 'camera', enabled: false, effects: [] } }
    if (target === 'unknown')
      return refused(
        'notFound',
        `no camera "${textOf(input, 'cameraId') ?? ''}" in the scene in front, by id or name — scene.state answers "nodes", the ones of type "camera"`,
      )

    // `targetOf` only answers a camera that OWNS a stack, so this is never `null` here — it is
    // the scene's otherwise, which is what the camera would be filming through anyway.
    const stack = postStackOf(open.state, target) ?? open.state.world.post
    const skipped = new Set(planStack(stack).skipped.map(one => one.id))

    return {
      ok: true,
      data: {
        owner: target.kind,
        enabled: stack.enabled,
        effects: stack.effects.map(one => ({
          id: one.id,
          effect: one.effect,
          enabled: one.enabled,
          skipped: skipped.has(one.id),
          params: one.params,
        })),
      },
    }
  },

  'post.add': input => {
    const effect = textOf(input, 'effect') ?? ''
    if (!isPostEffectId(effect))
      return refused('badInput', `"effect" wants one of: ${Object.keys(POST_EFFECTS).join(', ')}`)
    return editPost(
      input,
      target => addPostEffect(target, effect, newId()),
      'that effect built no command on this composition',
    )
  },

  'post.remove': input =>
    editPost(
      input,
      (target, stack, state) => {
        const effectId = effectIn(stack, input)
        return effectId ? removePostEffectWholly(state, target, effectId) : null
      },
      '"effectId" must name an instance of this composition — post.state answers "effects" with their ids',
    ),

  'post.move': input =>
    editPost(
      input,
      (target, stack) => {
        const effectId = effectIn(stack, input)
        const by = numberOf(input, 'by')
        return effectId && by !== null ? movePostEffect(target, effectId, by) : null
      },
      '"effectId" must name an instance of this composition and "by" is wanted — post.state answers "effects" in the order they run',
    ),

  /** Which of the three value fields a call may use is the SPEC's to say, never a coercion. */
  'post.set': input =>
    editPost(
      input,
      (target, stack) => {
        const effectId = effectIn(stack, input)
        const effect = stack.effects.find(one => one.id === effectId)
        const param = textOf(input, 'param') ?? ''
        const spec = effect ? POST_EFFECTS[effect.effect].params[param] : undefined
        if (!effectId || !spec) return null

        const given =
          spec.control === 'toggle'
            ? maybeBoolOf(input, 'on')
            : spec.control === 'number' || spec.control === 'slider'
              ? numberOf(input, 'value')
              : textOf(input, 'text')
        if (given === null) return null

        return setPostParam(target, effectId, param, boundParam(spec, given))
      },
      '"effectId" must name an instance of this composition and "param" one of that effect\'s parameters, with the value in "on" for a toggle, "value" for a number or a slider, "text" otherwise — post.state answers "effects" with their ids and their "params"',
    ),

  'post.setEffectEnabled': input =>
    editPost(
      input,
      (target, stack) => {
        const effectId = effectIn(stack, input)
        const enabled = maybeBoolOf(input, 'enabled')
        return effectId && enabled !== null ? setPostEffectEnabled(target, effectId, enabled) : null
      },
      '"effectId" must name an instance of this composition and "enabled" is wanted — post.state answers "effects" with their ids',
    ),

  'post.setWholeStackEnabled': input =>
    editPost(
      input,
      target => {
        const enabled = maybeBoolOf(input, 'enabled')
        return enabled === null ? null : setPostEnabled(target, enabled)
      },
      '"enabled" is wanted, true or false',
    ),

  /**
   * By id or by NAME, the shipped ones and the ones saved on this machine alike — `stackOfPreset`
   * is the very resolution the panel's picker goes through, so a client and a hand reach the
   * same eleven-plus-N looks.
   */
  'post.applyPreset': input =>
    editPost(
      input,
      target => {
        const next = stackOfPreset(textOf(input, 'preset') ?? '', savedPresets(), newId)
        return next ? applyPostStack(target, next) : null
      },
      `"preset" names none of the looks this studio holds — post.listPresets answers "shipped" and "saved", by id and by name`,
    ),

  /** What `post.preset` will answer to. Without it a client cannot know a saved look exists. */
  'post.listPresets': () => ({
    ok: true,
    data: {
      shipped: POST_PRESET_IDS,
      saved: savedPresets().map(preset => ({ id: preset.id, name: preset.name })),
    },
  }),

  'post.duplicate': input =>
    editPost(
      input,
      (target, stack) => {
        const effectId = effectIn(stack, input)
        return effectId ? duplicatePostEffect(target, effectId, newId()) : null
      },
      '"effectId" must name an instance of this composition — post.state answers "effects" with their ids',
    ),

  'post.reset': input =>
    editPost(
      input,
      (target, stack) => {
        const effectId = effectIn(stack, input)
        return effectId ? resetPostEffect(target, effectId) : null
      },
      '"effectId" must name an instance of this composition — post.state answers "effects" with their ids',
    ),

  /**
   * The ABSOLUTE value the panel shows, at the head — `keyPostParam` writes the delta against the
   * stack, which is arithmetic no client should have to do. A parameter the catalogue does not
   * call animatable is refused rather than written where nothing reads.
   */
  'post.addKeyframe': input =>
    editPost(
      input,
      (target, stack, state) => {
        const effectId = effectIn(stack, input)
        const param = textOf(input, 'param') ?? ''
        const value = numberOf(input, 'value')
        const effect = stack.effects.find(one => one.id === effectId)
        if (!effectId || !effect || value === null) return null

        return keyPostParam(
          state,
          target,
          effectId,
          param,
          headAt(),
          value,
          // A channel name is screen text: one opened from outside must read like one the diamond
          // opened. `i18next` answers nothing before a window has initialised it — a test.
          postChannelName(speaksBundle(), effect.effect, param),
        )
      },
      '"effectId" must name an instance of this composition and "value" is wanted, with "param" one of that effect\'s animatable parameters — post.state answers "effects" with their ids and their "params"',
    ),

  'post.removeKeyframe': input =>
    editPost(
      input,
      (target, stack, state) => {
        const effectId = effectIn(stack, input)
        return effectId
          ? unkeyPostParam(state, target, effectId, textOf(input, 'param') ?? '', headAt())
          : null
      },
      '"effectId" must name an instance of this composition — post.state answers "effects" with their ids',
    ),

  /**
   * On this MACHINE, beside the ones the studio ships. The three below touch no document, so they
   * answer without a command and outside the history — forgetting a preset is not an edit ⌘Z
   * could take back.
   */
  'post.savePreset': input =>
    withStack(input, ({ stack }) => {
      const saved = usePostPresets.getState().savePostPreset(textOf(input, 'name') ?? '', stack)
      // The store is what refuses a blank name — see `savePostPreset`, which trims it too.
      return saved
        ? { ok: true, data: { presetId: saved } }
        : refused('badInput', '"name" is wanted, and a name of nothing but spaces is not one')
    }),

  'post.renamePreset': input => {
    const preset = savedNamed(textOf(input, 'preset') ?? '')
    if (!preset) return refused('notFound', 'no preset of that id or name is saved here')

    const renamed = usePostPresets
      .getState()
      .renamePostPreset(preset.id, textOf(input, 'name') ?? '')
    return renamed
      ? { ok: true }
      : refused('badInput', '"name" is wanted, and a name of nothing but spaces is not one')
  },

  'post.deleteSavedPreset': input => {
    const preset = savedNamed(textOf(input, 'preset') ?? '')
    if (!preset) return refused('notFound', 'no preset of that id or name is saved here')

    usePostPresets.getState().forgetPostPreset(preset.id)
    return { ok: true }
  },

  'post.setCameraStackMode': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const named = textOf(input, 'nodeId') ?? ''
    const node = nodeAimed(open.state, named)
    if (node?.type !== 'camera')
      return refused(
        'notFound',
        `no camera "${named}" in the scene in front, by id or name — scene.state answers "nodes", the ones of type "camera"`,
      )

    const mode = oneOf(input, 'mode', CAMERA_POST_MODES)
    if (mode === null)
      return refused('badInput', `"mode" wants one of: ${CAMERA_POST_MODES.join(', ')}`)

    useScenes.getState().runCommand(open.documentId, setCameraPostMode(open.state, node.id, mode))
    return { ok: true }
  },
}

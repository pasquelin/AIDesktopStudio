import { refused, type ActionOutcome } from '@shared/domain/assistant'
import {
  BODY_PARTS,
  HUMANOID_ROLES,
  type BodyPart,
  type HumanoidRole,
} from '@shared/domain/humanoid'
import {
  assetClip,
  bundledClip,
  CLIP_SOURCES,
  embeddedClip,
  ROOT_MOTIONS,
  type ClipRef,
} from '@shared/domain/scene'
import { secondsToUs, snapToFrame } from '@shared/domain/time'
import { clampPlayhead } from '@/engines/scene/animationEval'
import { clipsEdited, clipsMoved, laneHolding, lanesWith } from '@/engines/scene/clipBlend'
import { removeModelClip, setModelLanes } from '@/engines/scene/commands'
import type { Command } from '@/engines/core/history'
import type { CharacterState } from '@/engines/character/characterState'
import {
  addCharacterBone,
  addCharacterHands,
  addCharacterIkChain,
  addCharacterSocket,
  removeCharacterBone,
  removeCharacterIkChain,
  removeCharacterSocket,
  renameCharacterBone,
  setCharacterBoneRole,
  setCharacterAutoRig,
  setCharacterRig,
} from '@/engines/character/characterCommands'
import { autoRigServiceFor } from '@/engines/character/autoRigBackends'
import { DEFAULT_AUTO_RIG_OPTIONS } from '@shared/domain/autoRigInference'
import { workshopIdOf } from '@shared/domain/character'
import { useCharacters } from '@/stores/character'
import { type ModelNode, type SceneState } from '@/engines/scene/sceneState'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { newId } from '@/helpers/ids'
import { assetsById, useAssets } from '@/stores/assets'
import { getBridge } from '@/services/bridge'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { clipsOfNode, useModelFiles } from '@/stores/modelFiles'
import { laySceneClip, sceneOf, useScenes } from '@/stores/scenes'
import { sceneEngineOf } from '@/stores/sceneEngines'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { MeshSample } from '@/engines/scene/rigSnap'
import { type ActionHandlers } from './actionHandler'
import { NO_SCENE } from './sceneHandlers'
import { maybeBoolOf, numberOf, oneOf, textOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'
import { RIG_KEY_HANDLERS } from './rigKeyHandlers'

/**
 * The skeleton of a character, the handles its joints reach for, and the blocks laid on its band.
 * Every edit runs the command the inspector runs, so ⌘Z takes it back. Nothing is rebuilt here.
 */

/** The 3D tab in front and the model named in it, or nothing — which reads as `wrongSurface`. */
function model(input: Record<string, unknown>): { documentId: string; node: ModelNode } | null {
  const documentId = activeSceneId(useDocuments.getState())
  if (documentId === null) return null

  const node = nodeAimed(sceneOf(useScenes.getState(), documentId), textOf(input, 'nodeId') ?? '')
  return node?.type === 'model' ? { documentId, node } : null
}

/**
 * Why `model` answered nothing — the scene is not in front, or the node named is not a model.
 *
 * 🛑 One refusal for both sent the model repairing what was not broken: measured on the bench
 * pass of 2026-08-25, `animations.list` aimed at a sphere answered `wrongSurface` sixteen times
 * while the scene WAS in front, and the model kept re-activating the document.
 */
function noModel(input: Record<string, unknown>): ActionOutcome {
  return activeSceneId(useDocuments.getState()) === null
    ? refused('wrongSurface', NO_SCENE)
    : refused(
        'notFound',
        `no model node "${textOf(input, 'nodeId') ?? ''}" in the scene in front — scene.state answers "nodes", and only the ones of type "model" carry a rig or a band`,
      )
}

/** Runs one command on the model named, refusing before it rather than writing nothing. */
function editModelOf(
  input: Record<string, unknown>,
  build: (node: ModelNode, documentId: string) => Command<SceneState> | null,
  /** What a caller does when the model IS there and the build still declines. */
  nothing: string,
): ActionOutcome {
  const open = model(input)
  if (!open) return noModel(input)

  const command = build(open.node, open.documentId)
  if (!command) return refused('notFound', nothing)

  useScenes.getState().runCommand(open.documentId, command)
  return { ok: true }
}

/**
 * The character the skeleton window is editing, or nothing.
 *
 * 🛑 A skeleton lives in a FILE now, not on a node: an action that named a node would be naming
 * the one place the studio no longer keeps one.
 */
function character(): CharacterState | null {
  const open = Object.values(useCharacters.getState().states).find(one => one.assetId !== '')
  return open ?? null
}

function noCharacter(): ActionOutcome {
  return refused(
    'wrongSurface',
    'no character is open — a skeleton is edited in its own window, which file.open puts a `.glb` in',
  )
}

/** The bone named on that character, so a name nobody answers to is a refusal rather than a no-op. */
function boneOf(state: CharacterState, name: string | null): string | null {
  return name !== null && state.rig?.bones.some(bone => bone.name === name) ? name : null
}

/** One edit of the open character, refused when the build declines. */
function editCharacter(
  build: (state: CharacterState) => Command<CharacterState> | null,
  nothing: string,
): ActionOutcome {
  const open = character()
  if (!open) return noCharacter()

  const command = build(open)
  if (!command) return refused('notFound', nothing)

  useCharacters.getState().runCommand(open.assetId, command)
  return { ok: true }
}

/**
 * The skeleton the studio fits to the mesh it has measured. `null` bounds mean the engine has not
 * read the model yet, which is a wait rather than a fault.
 */
async function fitRig(
  _input: Record<string, unknown>,
  _wire?: unknown,
  signal = new AbortController().signal,
): Promise<ActionOutcome> {
  const open = character()
  if (!open) return noCharacter()

  const documentId = workshopIdOf(open.assetId)
  const node = sceneOf(useScenes.getState(), documentId).nodes.find(
    candidate => candidate.type === 'model',
  )
  const engine = sceneEngineOf(documentId)
  const sample = node ? engine?.meshSample(node.id) : null
  if (!node || !engine || !sample)
    return refused(
      'notFound',
      'the studio has not measured this character yet — rig.state answers "status"; wait for it to read the file, then send this again',
    )

  try {
    return await fitMeasuredRig(open, documentId, node.id, engine, sample, signal)
  } catch (error) {
    return refused(
      'failed',
      String(error).includes('CANCELLED')
        ? 'Auto Rig was cancelled before it changed the character'
        : 'Auto Rig could not produce a valid skeleton and skin for this character',
    )
  }
}

async function fitMeasuredRig(
  open: CharacterState,
  documentId: string,
  nodeId: string,
  engine: SceneRenderer,
  sample: MeshSample,
  signal: AbortSignal,
): Promise<ActionOutcome> {
  const targets = engine.autoRigTargets(nodeId)
  const service = autoRigServiceFor(
    async (_backendInput, context) => {
      const result = await engine.simpleAutoRig(nodeId, sample, context.signal, context.onProgress)
      if (!result) throw new Error('INVALID_MESH')
      return result
    },
    async () => {
      throw new Error('ENGINE_UNAVAILABLE')
    },
  )
  const result = await service.run('simple', DEFAULT_AUTO_RIG_OPTIONS, {
    signal,
    onProgress: () => {},
    targets,
  })
  if (sceneEngineOf(documentId) !== engine || engine.autoRigTargets(nodeId).length === 0)
    return refused('notFound', 'the character changed before Auto Rig completed')
  useCharacters.getState().runCommand(open.assetId, setCharacterAutoRig(result))
  return { ok: true }
}

/** What the panels read off a character: its bones, their roles, its handles, what it can play. */
function rigState(): ActionOutcome {
  const open = character()
  if (!open) return noCharacter()

  return {
    ok: true,
    data: {
      rigged: open.rig !== null,
      bones: open.rig?.bones ?? [],
      ik: open.rig?.ik ?? [],
      sockets: open.sockets,
      motions: open.motions,
    },
  }
}

// The asset's kind is checked as `addAnimationTo` checks it: a mesh laid on a band would be a
// block that plays nothing.
async function addAnimation(input: Record<string, unknown>): Promise<ActionOutcome> {
  const source = oneOf(input, 'source', CLIP_SOURCES) ?? 'asset'
  const assetId = textOf(input, 'assetId')
  const clipName = textOf(input, 'clipName')

  if (source === 'asset') return addAssetAnimation(input, assetId, clipName)

  if (assetId !== null || clipName === null)
    return refused('badInput', `source "${source}" wants "clipName" and no "assetId"`)

  // Read against what the model can actually play, so a name its file does not spell is a refusal
  // rather than a block that stands on the band and plays nothing.
  const open = model(input)
  if (!open) return noModel(input)
  const playable =
    source === 'embedded'
      ? clipsOfNode(useModelFiles.getState(), open.documentId, open.node.id)
      : await bundledNames()

  if (!playable.includes(clipName))
    return refused(
      'notFound',
      `"${clipName}" is not among the "${source}" clips this model can play — animations.list answers "embedded" and "bundled" by name`,
    )

  return layBlockOf(
    input,
    source === 'embedded' ? embeddedClip(newId(), clipName) : bundledClip(newId(), clipName),
  )
}

function addAssetAnimation(
  input: Record<string, unknown>,
  assetId: string | null,
  clipName: string | null,
): ActionOutcome {
  if (clipName !== null || assetId === null)
    return refused('badInput', 'source "asset" wants "assetId" and no "clipName"')

  const asset = assetsById(useAssets.getState()).get(assetId)
  if (!asset)
    return refused(
      'notFound',
      `no asset "${assetId}" in this library — assets.searchProjectCatalogue answers what is in it`,
    )
  if (asset.type !== 'animation')
    return refused(
      'badInput',
      `asset "${assetId}" is of type "${asset.type}", and a block wants one of type "animation" — assets.searchProjectCatalogue with type "animation" answers which are`,
    )

  return layBlockOf(input, assetClip(newId(), asset.id, asset.name))
}

/** Laid through the very gesture the panels use, so a block an assistant lays lands CHOSEN too. */
function layBlockOf(input: Record<string, unknown>, clip: ClipRef): ActionOutcome {
  const open = model(input)
  if (!open) return noModel(input)

  laySceneClip(open.documentId, open.node.id, clip)
  return { ok: true }
}

/** The animations shipped with the app, by folder — the picker's own second list. */
async function bundledNames(): Promise<readonly string[]> {
  const shipped = (await getBridge()?.animations.list()) ?? []
  return shipped.map(animation => animation.name)
}

async function listAnimations(input: Record<string, unknown>): Promise<ActionOutcome> {
  const open = model(input)
  if (!open) return noModel(input)

  return {
    ok: true,
    data: {
      embedded: clipsOfNode(useModelFiles.getState(), open.documentId, open.node.id),
      bundled: await bundledNames(),
      assets: [...assetsById(useAssets.getState()).values()]
        .filter(asset => asset.type === 'animation')
        .map(asset => ({ id: asset.id, name: asset.name })),
      // What is already laid, so a client can settle or take one back without a second read.
      lanes: open.node.model.lanes ?? [],
    },
  }
}

// Rewritten IN PLACE inside its own lane, as the inspector does it: a block reordered because a
// speed changed would move on screen.
function editBlock(input: Record<string, unknown>): ActionOutcome {
  const fade = numberOf(input, 'fadeSeconds')
  const start = numberOf(input, 'startSeconds')
  const offset = numberOf(input, 'offsetSeconds')
  const speed = numberOf(input, 'speed')
  const rootMotion = oneOf(input, 'rootMotion', ROOT_MOTIONS)
  const part: BodyPart | null = oneOf(input, 'part', BODY_PARTS)

  const loop = maybeBoolOf(input, 'loop')
  const patch: Partial<ClipRef> = {
    ...(offset === null ? {} : { offset }),
    ...(speed === null ? {} : { speed }),
    ...(loop === null ? {} : { loop }),
    ...(fade === null ? {} : { fadeIn: secondsToUs(fade), fadeOut: secondsToUs(fade) }),
    ...(rootMotion === null ? {} : { rootMotion }),
    ...(part === null ? {} : { part }),
  }
  if (start === null && Object.keys(patch).length === 0)
    return refused(
      'badInput',
      'this call named nothing to write on the block: startSeconds, offsetSeconds, speed, loop, fadeSeconds, rootMotion or part',
    )

  return editModelOf(
    input,
    (node, documentId) => {
      const lanes = node.model.lanes ?? []
      const clipId = textOf(input, 'clipId') ?? ''
      const holding = laneHolding(lanes, clipId)
      if (!holding) return null

      // Where the band can actually reach, as a drag lands it: a block posed off a frame plays a
      // pose the head never stops on, and one past the end sits where it can never be grabbed back.
      const band = sceneOf(useScenes.getState(), documentId).animation
      const at =
        start === null
          ? null
          : clampPlayhead(snapToFrame(secondsToUs(start), band.fps), band.duration)

      const written = lanesWith(lanes, holding.id, clips => {
        const moved = at === null ? clips : (clipsMoved(clips, clipId, at) ?? clips)
        return Object.keys(patch).length === 0
          ? at === null || moved === clips
            ? null
            : moved
          : clipsEdited(moved, clipId, clip => ({ ...clip, ...patch }))
      })

      return written ? setModelLanes(node.id, written) : null
    },
    '"clipId" names no block on this model\'s lanes, or the call would move it nowhere — animations.list answers "lanes" with the clips on them',
  )
}

export const RIG_HANDLERS: ActionHandlers = {
  ...RIG_KEY_HANDLERS,
  'rig.state': rigState,
  'rig.fit': fitRig,
  'rig.clear': () =>
    editCharacter(
      state => (state.rig ? setCharacterRig(null) : null),
      'this character carries no rig to clear — rig.state answers "rigged", and rig.fit builds one',
    ),
  'rig.configureHands': () =>
    editCharacter(
      state => (state.rig ? addCharacterHands() : null),
      'this character carries no rig to add hands to — rig.fit builds one first',
    ),

  'socket.add': input =>
    editCharacter(state => {
      const bone = boneOf(state, textOf(input, 'bone'))
      const name = textOf(input, 'name') ?? ''
      return bone === null || name === ''
        ? null
        : addCharacterSocket({ id: newId(), name, bone, rest: IDENTITY_TRANSFORM })
    }, '"bone" must name a bone of this character and "name" the point — rig.state answers "bones"'),

  'socket.remove': input =>
    editCharacter(state => {
      const named = textOf(input, 'name')
      const socket = state.sockets.find(one => one.name === named || one.id === named)
      return socket ? removeCharacterSocket(socket.id) : null
    }, '"name" must name an attachment point this character carries — rig.state answers "sockets"'),

  'bone.add': input =>
    editCharacter(state => {
      const parent = boneOf(state, textOf(input, 'parent'))
      return parent === null ? null : addCharacterBone(parent)
    }, '"parent" must name a bone of this character — rig.state answers "bones" with their names'),

  'bone.remove': input =>
    editCharacter(state => {
      const bone = boneOf(state, textOf(input, 'bone'))
      return bone === null ? null : removeCharacterBone(bone)
    }, '"bone" must name a bone of this character — rig.state answers "bones" with their names'),

  'bone.rename': input =>
    editCharacter(state => {
      const bone = boneOf(state, textOf(input, 'bone'))
      const name = textOf(input, 'name') ?? ''
      // A name already taken is refused here rather than by the command, which writes nothing
      // for a duplicate — and a client told `ok` would believe the rename took.
      return bone === null || state.rig?.bones.some(one => one.name === name)
        ? null
        : renameCharacterBone(bone, name)
    }, '"bone" must name a bone of this character and "name" must be free of the others'),

  'bone.setRole': input =>
    editCharacter(state => {
      const bone = boneOf(state, textOf(input, 'bone'))
      const role: HumanoidRole | null = oneOf(input, 'role', HUMANOID_ROLES)
      return bone === null ? null : setCharacterBoneRole(bone, role)
    }, '"bone" must name a bone of this character — rig.state answers "bones" with their names'),

  'ik.add': input =>
    editCharacter(state => {
      const bone = boneOf(state, textOf(input, 'bone'))
      return bone === null ? null : addCharacterIkChain(bone)
    }, '"bone" must name a bone of this character — rig.state answers "bones" with their names'),

  'ik.remove': input =>
    editCharacter(state => {
      const chainId = textOf(input, 'chainId') ?? ''
      return state.rig?.ik?.some(chain => chain.id === chainId)
        ? removeCharacterIkChain(chainId)
        : null
    }, '"chainId" must name a handle of this character — rig.state answers "ik" with their ids'),

  'animations.list': listAnimations,
  'animation.addBlock': addAnimation,
  'animation.setBlockSettings': editBlock,

  'animation.removeBlock': input =>
    editModelOf(
      input,
      node => {
        const clipId = textOf(input, 'clipId') ?? ''
        return node.model.lanes?.some(lane => lane.clips.some(clip => clip.id === clipId))
          ? removeModelClip(node.id, clipId)
          : null
      },
      '"clipId" names no block laid on this model — animations.list answers "lanes" with the clips on them',
    ),
}

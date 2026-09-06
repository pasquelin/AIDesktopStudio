import type { Command } from '@/engines/core/history'
import { addCameraShot } from '@/engines/scene/animationCommands'
import { newShotAt } from '@/engines/scene/cameraShots'
import {
  addNodes,
  canMoveNode,
  reorderNodes,
  reparentNode,
  setPath,
  setSelection,
} from '@/engines/scene/commands'
import { createNodesOf } from '@/engines/scene/nodeFactory'
import { bringsSecondPlayer } from '@/engines/scene/playerModule'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { newId } from '@/helpers/ids'
import { useScenes } from '@/stores/scenes'
import { type CameraShot } from '@shared/domain/animation'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { type PathDescriptor } from '@shared/domain/scene'
import type { Target } from '@shared/domain/target'
import { SECOND } from '@shared/domain/time'
import { numberOf, textOf, textsOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'

import { edit, editNode, mounted, mountedScene, NO_SCENE, vectorOf } from './sceneHandlerCore'
export function editPath(
  input: Record<string, unknown>,
  change: (path: PathDescriptor) => PathDescriptor,
): ActionOutcome {
  return editNode(input, node => {
    if (node.type !== 'path') return null

    const next = change(node.path)
    return next === node.path ? null : setPath(node.id, next)
  })
}

/**
 * The same as `editNode`, for one named SHOT. A client works on shots by id because that is what
 * `scene.state` hands it — an instant would leave two shots of one camera to choose between.
 */
export function editShot(
  input: Record<string, unknown>,
  build: (shot: CameraShot, state: SceneState) => Command<SceneState> | null,
  /** What a caller does when the shot IS there and the build still declines. */
  nothing: string,
): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const shotId = textOf(input, 'shotId') ?? ''
  const shot = open.state.animation.shots.find(held => held.id === shotId)
  if (!shot)
    return refused(
      'badInput',
      `no camera shot "${shotId}" on this scene's band — scene.state answers "shots" with their ids, and camera.addShot opens one`,
    )

  const command = build(shot, open.state)
  if (!command) return refused('badInput', nothing)

  useScenes.getState().runCommand(open.documentId, command)
  return { ok: true }
}

/** A shot opened for a camera, answering the id it was born with — a client edits it by that. */
export function openShot(input: Record<string, unknown>): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const nodeId = textOf(input, 'nodeId') ?? ''
  if (nodeAimed(open.state, nodeId)?.type !== 'camera') {
    return refused(
      'badInput',
      `"nodeId" reads "${nodeId}", which is no camera of this scene — scene.state answers "nodes", and a shot needs one of type "camera"`,
    )
  }

  const seconds = numberOf(input, 'durationSeconds')
  const opened = newShotAt(
    open.state.animation,
    nodeId,
    newId(),
    (numberOf(input, 'startSeconds') ?? 0) * SECOND,
  )
  // The floor `newShotAt` holds is a frame, and a duration below it would be a bar nothing can
  // grab back.
  const shot =
    seconds === null ? opened : { ...opened, duration: Math.max(opened.duration, seconds * SECOND) }

  useScenes.getState().runCommand(open.documentId, addCameraShot(shot))
  return { ok: true, data: { shotId: shot.id } }
}

/** Adds what the caller built, answering the id of the node the rest hangs from. */
export function place(nodes: readonly SceneNode[]): ActionOutcome {
  const root = nodes[0]
  if (!root) return refused('badInput', 'nothing to place — no node could be built from this call')

  const outcome = edit(() => addNodes(nodes))
  return outcome.ok ? { ok: true, data: { nodeId: root.id } } : outcome
}

export function add(input: Record<string, unknown>): ActionOutcome {
  // The factory answers an empty list for a kind no registry declares, which is where it becomes
  // a refusal rather than a node that never arrived.
  const built = createNodesOf(textOf(input, 'kind') ?? '')
  const root = built[0]
  if (!root)
    return refused(
      'badInput',
      `no node kind "${textOf(input, 'kind') ?? ''}" can be built — the "kind" field of this action lists the ones that can`,
    )

  const open = mountedScene()
  if ('ok' in open) return open
  if (bringsSecondPlayer(open.state.nodes, built))
    return refused(
      'badInput',
      'this scene already holds a player module, and a scene may hold only one — "node.remove" it first, or edit the one it has',
    )

  // 🛑 The name and the place are the ROOT's: written onto each, a module would stack its body,
  // its arm and its camera at one point under one name.
  return place([
    {
      ...root,
      name: textOf(input, 'name') ?? root.name,
      transform: {
        ...root.transform,
        position: vectorOf(input, 'position', root.transform.position),
      },
    },
    ...built.slice(1),
  ])
}

export function select(input: Record<string, unknown>): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_SCENE)

  const known = new Set(open.state.nodes.map(node => node.id))
  const nodeIds = textsOf(input, 'nodeIds')
  const missing = nodeIds.filter(id => !known.has(id))
  if (missing.length > 0)
    return refused(
      'notFound',
      `the scene in front holds no node ${missing.join(', ')} — scene.state answers "nodes" with the ids it does hold`,
    )

  // Selection is not a command and does not change the document revision.
  useScenes.getState().replaceView(open.documentId, setSelection(open.state, nodeIds))
  return { ok: true }
}

/**
 * What a sentence may aim at inside a scene, as the outliner names them.
 *
 * 🛑 Published for the same reason the layer stack is: without it the briefing named no node at
 * all, and a model asked to move « le cube » spelled an id it had invented — `<nodeId>`, the
 * name in the id's place, `node-1`. The tree is FLATTENED here: `narrowTargets` ranks and cuts,
 * and depth is not what a spoken request picks by.
 */
export function nodeTargets(): readonly Target[] {
  const open = mounted()
  if (!open) return []

  return open.state.nodes.map(node => ({
    id: node.id,
    kind: 'node',
    name: node.name,
    selected: open.state.selectedIds.includes(node.id),
  }))
}

/** Aiming at one of them, through the same door `node.select` uses — never a second path. */
export function selectNode(id: string): ActionOutcome {
  return select({ nodeIds: [id] })
}

export function reparent(input: Record<string, unknown>): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_SCENE)

  const parentId = textOf(input, 'parentId')
  if (parentId !== null && !nodeAimed(open.state, parentId)) {
    return refused(
      'notFound',
      `no node "${parentId}" in the scene in front, by id or name — scene.state answers "nodes"; send "" to hang this one at the root`,
    )
  }

  // A place among the new siblings, or none: hanging a node somewhere leaves it where it already
  // sits, which is what dropping a row ONTO another does on screen.
  const index = numberOf(input, 'index')

  // A move that would close the tree on itself, or take a player module apart, is refused by
  // handing the state back untouched, which without this reads as done.
  return editNode(input, node =>
    !canMoveNode(open.state.nodes, node.id, parentId)
      ? null
      : index === null
        ? reparentNode(node.id, parentId)
        : reorderNodes([node.id], parentId, index),
  )
}

// `editNode`'s twin for the half of the document that belongs to no node. An empty patch is a
// refusal rather than a no-op: a client that named nothing meant something.

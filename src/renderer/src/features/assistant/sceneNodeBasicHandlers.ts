import { canNegate } from '@/engines/csg/carve'
import { movesToCommand } from '@/engines/scene/animationCommands'
import { poseAt } from '@/engines/scene/animationEval'
import {
  attachNode,
  carveNodes,
  invertCarve,
  removeNode,
  renameNode,
  separateNode,
  setNodesNegative,
  setNodeVisible,
} from '@/engines/scene/commands'
import { modelNode } from '@/engines/scene/nodeFactory'
import { tearsPlayerApart } from '@/engines/scene/playerModule'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { sceneOf, useScenes } from '@/stores/scenes'
import { refused } from '@shared/domain/assistant'
import { CSG_OPERATIONS } from '@shared/domain/csg'
import { TONE_MAPPINGS } from '@shared/domain/scene'
import { withAsset, type ActionHandlers } from './actionHandler'
import { boolOf, maybeBoolOf, numberOf, oneOf, textOf, textsOf } from './actionInputs'
import { nodeAimed } from './nodeAimed'

import {
  aimedNodes,
  editNode,
  mounted,
  mountedScene,
  movedOf,
  socketIdOf,
  vectorOf,
} from './sceneHandlerCore'
import { add, place, reparent, select } from './sceneNodeActions'
import { editWorld } from './sceneWorldHandlers'

export const SCENE_NODE_BASIC_HANDLERS: ActionHandlers = {
  'world.setToneMapping': input => {
    const toneMapping = oneOf(input, 'toneMapping', TONE_MAPPINGS)
    const exposure = numberOf(input, 'exposure')

    return editWorld(
      () => ({
        ...(toneMapping === null ? {} : { toneMapping }),
        ...(exposure === null ? {} : { exposure }),
      }),
      'this call named neither toneMapping nor exposure, and one of the two is what it writes',
    )
  },
  'node.add': add,
  'node.select': select,
  'node.reparent': reparent,

  /**
   * 🛑 Through `withAsset`: an id nothing holds used to make a node all the same, and the caller
   * was answered `ok` with the id of a model that shows nothing. Measured on the bench pass of
   * 2026-08-25, where `assetId: "<meshId>"` — the placeholder, spelt out — was accepted.
   */
  'node.addModel': input => {
    const assetId = textOf(input, 'assetId') ?? ''
    return withAsset(assetId, () => place([modelNode(assetId, textOf(input, 'name') ?? assetId)]))
  },

  // 🛑 Refused HERE and not left to the command: `editNode` reads a `null` as a refusal, and
  // `removeNode` always answers a command — a module's eye would come back « removed ».
  'node.remove': input =>
    editNode(input, node =>
      tearsPlayerApart(mounted()?.state.nodes ?? [], [node.id]) ? null : removeNode(node.id),
    ),

  /**
   * Marks shapes as tools for the next fold, or takes the mark off. The same command the toolbar
   * runs, so both doors read one rule — `carvePlan` says what a mark means.
   */
  'node.markAsCuttingTool': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const named = textsOf(input, 'nodeIds')
    const picked = aimedNodes(open.state, input)
    // Every id, not merely the ones that resolved: a misspelt name would otherwise mark half the
    // selection and answer `ok`, and the next fold would run the wrong way with nothing said.
    if (picked.length !== named.length)
      return refused('notFound', `no node "${named}" in the scene in front`)
    if (!canNegate(picked)) return refused('badInput', 'none of those nodes carries a shape')

    // Absent means "mark them", the gesture a client asks for nine times out of ten; the toolbar
    // toggles instead, since a button has no room to say which of the two it means.
    const negative = maybeBoolOf(input, 'negative') ?? true
    useScenes.getState().runCommand(open.documentId, setNodesNegative(picked, negative))
    return { ok: true }
  },

  /**
   * The ORDER OF THE IDS says nothing: a marked shape is a tool, and what is left is elected by
   * volume — `carvePlan` is where both rules live, and the toolbar reads the same one. `matterId`
   * names the matter outright, for the rare cut that runs the other way.
   */
  'node.combineIntoSolid': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const operation = oneOf(input, 'operation', CSG_OPERATIONS)
    const command =
      operation &&
      carveNodes(
        aimedNodes(open.state, input),
        operation,
        open.state.nodes,
        textOf(input, 'matterId') ?? undefined,
      )
    // Two ways in: a selection where something carries no shape, or a `matterId` naming nothing
    // that could BE the matter — see `carvePlan`, which refuses rather than electing otherwise.
    if (!command) return refused('badInput', 'every id must carry a shape, and matterId be one')

    useScenes.getState().runCommand(open.documentId, command)
    // The id the description promises: a client cannot address the solid otherwise, short of
    // re-reading the whole scene. Read off the state after, since the command mints it.
    const solid = sceneOf(useScenes.getState(), open.documentId).nodes.find(
      node => node.type === 'carved' && !open.state.nodes.includes(node),
    )
    return { ok: true, data: { nodeId: solid?.id ?? '' } }
  },

  'node.swapSolidMatterAndTool': input =>
    editNode(input, (node, documentId) =>
      node.type === 'carved'
        ? invertCarve(node, sceneOf(useScenes.getState(), documentId).nodes)
        : null,
    ),

  'node.separate': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const node = nodeAimed(open.state, textOf(input, 'nodeId') ?? '')
    if (node?.type !== 'carved')
      return refused(
        'badInput',
        `"nodeId" must name a carved solid, which node.combineIntoSolid makes — scene.state answers "nodes", the ones with type "carved"`,
      )

    useScenes.getState().runCommand(open.documentId, separateNode(node))
    // The shapes handed back, as the description promises — their ids are what a client aims at
    // next, and nothing else names them.
    const after = sceneOf(useScenes.getState(), open.documentId)
    const given = after.nodes.filter(one => !open.state.nodes.includes(one)).map(one => one.id)
    return { ok: true, data: { nodeIds: given } }
  },

  // An empty socket takes it back off, as the field says: the node then hangs from the
  // character itself, which is where it stood before a point was named.
  'node.attach': input =>
    editNode(input, node => attachNode(node.id, socketIdOf(textOf(input, 'socket')))),

  'node.rename': input =>
    editNode(input, node => renameNode(node.id, textOf(input, 'name') ?? node.name)),

  'node.setVisible': input =>
    editNode(input, node => setNodeVisible(node.id, boolOf(input, 'visible'))),

  /**
   * The gizmo's own translation, and what an unnamed axis falls back to is the whole point: the
   * POSE PLAYED, never the rest. `recordMove` keys every channel from that fallback, so resting
   * values would write a neutral rotation over the key standing there. Radians, as the state.
   */
  'node.transform': input =>
    editNode(
      input,
      (node, documentId) => {
        const keying = sceneKeyingAt(documentId)
        const played = poseAt(node.transform, keying.state.animation, node.id, keying.at)
        const by = boolOf(input, 'relative')

        return movesToCommand(
          keying.state,
          [
            {
              id: node.id,
              transform: {
                position: vectorOf(input, 'position', played.position, by),
                rotation: vectorOf(input, 'rotation', played.rotation, by),
                scale: vectorOf(input, 'scale', played.scale, by),
              },
            },
          ],
          keying.at,
          keying.recording,
        )
      },
      (node, documentId) => movedOf(input, node, documentId),
    ),
}

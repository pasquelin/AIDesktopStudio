import { withComponent, type Component } from '@shared/domain/component'
import type { ObjectKind } from '@shared/domain/scene'
import { cachedOn } from '../core/cachedOn'
import { subtreesOf, type SceneNode } from './sceneState'

/** What the Add menu, the native menu and the toolbar all name the module by. */
export const PLAYER_KIND: ObjectKind = 'player'

const carries = (node: SceneNode, type: Component['type']): boolean =>
  node.components?.some(one => one.type === type) ?? false

/** What makes a node the module: the mark it carries, never its type — a module IS a group. */
export function isPlayerModule(node: SceneNode): boolean {
  return carries(node, 'Player')
}

/** What a module names, each answered structurally — a rename breaks none of the three. */
export type PlayerParts = {
  module: SceneNode
  /** What walks. The seat the camera takes, where a sweep used to hand it to the first controller. */
  body?: SceneNode
  arm?: SceneNode
  /** The camera anywhere under the arm, so tidying one into a group of its own breaks nothing. */
  eye?: SceneNode
  /** What is ANIMATED — the mesh, never the capsule. A script sits on the module and asks here. */
  animated?: SceneNode
}

type FoundParts = PlayerParts & { inside: readonly SceneNode[] }

const partsByNodes = new WeakMap<readonly SceneNode[], readonly FoundParts[]>()

/**
 * Every module's parts, built ONCE per list — the same bargain as `byIdOf`, and for the same
 * gesture: a drag filters each of its ids through `leavesPlayerModule`, and `subtreesOf` rebuilds
 * a whole-scene index per call. A scene with no module answers an empty list without walking one.
 */
function allPartsOf(nodes: readonly SceneNode[]): readonly FoundParts[] {
  return cachedOn(partsByNodes, nodes, () =>
    nodes.filter(isPlayerModule).map(module => partsIn(nodes, module)),
  )
}

/**
 * What the scene's module names. 🛑 The FIRST module in document order, which is a choice nothing
 * shows — refusing a second one is what makes that honest.
 */
export function playerPartsOf(nodes: readonly SceneNode[]): PlayerParts | null {
  return allPartsOf(nodes)[0] ?? null
}

/** The module that wears this id, or nothing — a second player is another module, not the first. */
export function partsOfModule(nodes: readonly SceneNode[], moduleId: string): PlayerParts | null {
  return allPartsOf(nodes).find(parts => parts.module.id === moduleId) ?? null
}

/**
 * Where `self.anim` writes: the module's animated mesh, a descendant that carries `Animator`,
 * or nothing — a script on a body with no machine must not invent a target.
 */
export function animatorTargetOf(nodes: readonly SceneNode[], entityId: string): string | null {
  return subtreesOf(nodes, [entityId]).find(node => carries(node, 'Animator'))?.id ?? null
}

/**
 * What a field naming a node may be pointed at: what shares its MODULE, or the whole scene when it
 * belongs to none — which is the list `withBoundPlayerArm` will resolve the name against.
 */
export function pickableNodesOf(nodes: readonly SceneNode[], id: string): readonly SceneNode[] {
  const owning = allPartsOf(nodes).find(parts => parts.inside.some(node => node.id === id))
  return owning?.inside ?? nodes
}

function partsIn(nodes: readonly SceneNode[], module: SceneNode): FoundParts {
  const inside = subtreesOf(nodes, [module.id])
  const arm = inside.find(node => carries(node, 'SpringArm'))
  const byId = new Map(inside.map(node => [node.id, node]))
  const hangsFrom = (node: SceneNode, ancestorId: string): boolean => {
    // No visited set, as every other walk of this chain here: `canReparent` refuses a cycle.
    for (let held = node.parentId; held !== null; held = byId.get(held)?.parentId ?? null) {
      if (held === ancestorId) return true
    }
    return false
  }

  return {
    module,
    inside,
    body: inside.find(node => carries(node, 'CharacterController')),
    animated: inside.find(node => carries(node, 'Animator')),
    arm,
    eye: arm && inside.find(node => node.type === 'camera' && hangsFrom(node, arm.id)),
  }
}

/**
 * Every node a word may name: its id first, then the FIRST node of that name — the resolution
 * `entityNamed` plays. Built as one map with ids laid first, so a homonym can never take an id.
 */
export function nodesByWord(nodes: readonly SceneNode[]): Map<string, SceneNode> {
  const held = new Map(nodes.map(node => [node.id, node]))
  for (const node of nodes) if (!held.has(node.name)) held.set(node.name, node)
  return held
}

/**
 * Every module's arm, pointed at the body and the eye it HANGS with. 🛑 `copiesOf` remaps ids and
 * nothing inside a component, so a name resolved globally aimed a duplicate at the original's
 * camera. What points OUTSIDE — the car a player drives — is the author's, and is kept.
 */
export function withBoundPlayerArm(nodes: readonly SceneNode[]): readonly SceneNode[] {
  const found = allPartsOf(nodes)
  if (found.length === 0) return nodes

  const bound = new Map<string, Component>()
  for (const parts of found) {
    const { arm, body, eye } = parts
    const held = arm?.components?.find(one => one.type === 'SpringArm')
    if (!arm || !held) continue

    const inside = nodesByWord(parts.inside)
    const own = (said: unknown, fresh?: SceneNode): string | null => {
      if (typeof said !== 'string') return fresh?.id ?? null

      // Named inside the module — by id or by the name a reader sees — so it plays as an exact id.
      const here = inside.get(said)
      if (here) return here.id

      const elsewhere = nodes.some(node => node.id === said || node.name === said)
      return elsewhere ? null : (fresh?.id ?? null)
    }

    const subject = own(held.subject, body)
    const camera = own(held.camera, eye)
    if (subject !== null || camera !== null) {
      bound.set(arm.id, {
        ...held,
        ...(subject === null ? {} : { subject }),
        ...(camera === null ? {} : { camera }),
      })
    }
  }

  if (bound.size === 0) return nodes

  return nodes.map(node => {
    const arm = bound.get(node.id)
    return arm ? { ...node, components: withComponent(node.components ?? [], arm) } : node
  })
}

/**
 * Whether taking these away would leave a module standing WITHOUT one of its parts. Taking the
 * module itself carries everything under it — a whole module going rather than a torn one.
 *
 * 🛑 The SUBTREE, not the ids named: `removeNode` takes one node and orphans what hung from it,
 * so a node standing between the module and a part costs exactly as much as the part.
 *
 * Blind spot, written rather than hidden: a `composed` command refuses only when EVERY part does
 * and its `apply` re-reads nothing, so this is bypassed inside one. Unreachable today, and
 * measured: the three parts are two groups and a camera, and `isCarvable` takes neither.
 */
export function tearsPlayerApart(nodes: readonly SceneNode[], ids: readonly string[]): boolean {
  const found = allPartsOf(nodes)
  if (found.length === 0) return false

  const doomed = new Set(subtreesOf(nodes, ids).map(node => node.id))
  return found.some(({ module, body, arm, eye }) => {
    if (doomed.has(module.id)) return false

    return [body, arm, eye].some(part => part !== undefined && doomed.has(part.id))
  })
}

/**
 * Whether hanging this node there would take a required part OUT of its module. Rearranging
 * inside one is the author's business; only leaving it is what nothing else would catch.
 */
export function leavesPlayerModule(
  nodes: readonly SceneNode[],
  id: string,
  parentId: string | null,
): boolean {
  return allPartsOf(nodes).some(({ inside, body, arm, eye }) => {
    if (![body, arm, eye].some(part => part?.id === id)) return false

    return parentId === null || !inside.some(node => node.id === parentId)
  })
}

/**
 * Whether putting these in would leave the scene with TWO modules — an add, a paste, a ⌘D.
 * Refused rather than arbitrated: which one plays would go back to being document order.
 */
export function bringsSecondPlayer(
  nodes: readonly SceneNode[],
  incoming: readonly SceneNode[],
): boolean {
  return allPartsOf(nodes).length > 0 && incoming.some(isPlayerModule)
}

/**
 * The module's own nodes, in the order they hang — what a module FILE holds, and nothing else of
 * the scene around it. `subtreesOf` keeps the roots it was named, so the module opens the list.
 */
export function playerModuleFileOf(nodes: readonly SceneNode[]): readonly SceneNode[] | null {
  const module = playerPartsOf(nodes)?.module
  return module ? subtreesOf(nodes, [module.id]) : null
}

/** The file these nodes were read out of, or `null` for a module built in the scene and never filed. */
export function playerModuleFrom(nodes: readonly SceneNode[]): string | null {
  const held = playerPartsOf(nodes)?.module.components?.find(one => one.type === 'Player')
  return typeof held?.from === 'string' && held.from !== '' ? held.from : null
}

/** The same nodes, marked with the file they now come from — what filing a module writes back. */
export function withPlayerModuleFrom(
  nodes: readonly SceneNode[],
  from: string,
): readonly SceneNode[] {
  return nodes.map(node => {
    const held = node.components?.find(one => one.type === 'Player')
    return held
      ? { ...node, components: withComponent(node.components ?? [], { ...held, from }) }
      : node
  })
}

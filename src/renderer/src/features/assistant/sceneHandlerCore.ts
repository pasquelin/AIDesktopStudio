import type { Command } from '@/engines/core/history'
import { poseAt } from '@/engines/scene/animationEval'
import { primitiveByKind } from '@/engines/scene/meshPrimitives'
import { type PropertySpec } from '@/engines/scene/propertyFields'
import {
  canCastShadow,
  canReceiveShadow,
  nodeById,
  type SceneNode,
  type SceneState,
} from '@/engines/scene/sceneState'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { useCharacters } from '@/stores/character'
import { activeSceneOrWorkshopId, useDocuments } from '@/stores/documents'
import { isWorkshopId } from '@shared/domain/character'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { AnimationTimeline as SceneAnimation } from '@shared/domain/animation'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { FONT_SOURCES, type FontRef } from '@shared/domain/font'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import { numericBoundsOf } from '@shared/domain/propertySpec'
import { type TextureSlot, type Vector3 } from '@shared/domain/scene'
import { movedParts, type Transform } from '@shared/domain/transform'
import { withinBounds } from '@shared/numeric'
import {
  composedNamedOf,
  composedNumber,
  numberOf,
  oneOf,
  recordOf,
  textOf,
  textsOf,
} from './actionInputs'
import { nodeAimed } from './nodeAimed'

/**
 * The scene graph, driven by value.
 *
 * Every node enters through `createNodesOf`, the factory the Add menu and the native menu go
 * through — a second way of building a box is a second set of defaults to keep in step.
 */

/** What a caller does about it, spelled once for every site that answers `wrongSurface` for want
 * of a scene — five modules of this folder read it. */
export const NO_SCENE =
  'the document in front is no scene — documents.list answers what is open and of which kind, and ' +
  'document.activate brings a scene forward'

/** Why a model tab takes no node: its workshop is drawn, never saved. Said to every editing door. */
export const NO_EDIT_ON_MODEL =
  'the model tab in front holds one model and saves no scene — open the model in a scene to add ' +
  'or edit nodes; what reaches it here is the view: scene.state, view.setDisplayMode, scene.capture'

export type Mounted = { documentId: string; state: SceneState }

/** The scene in front — or the workshop of the model tab in front — and its state, or nothing. */
export function mounted(): Mounted | null {
  const documentId = activeSceneOrWorkshopId(useDocuments.getState())
  return documentId === null
    ? null
    : { documentId, state: sceneOf(useScenes.getState(), documentId) }
}

/**
 * The scene in front for a door that WRITES, or the refusal to answer with: a model tab's workshop
 * is drawn and never saved, so every `runCommand` of this folder opens here rather than on `mounted`.
 */
export function mountedScene(): Mounted | ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_SCENE)
  return isWorkshopId(open.documentId) ? refused('wrongSurface', NO_EDIT_ON_MODEL) : open
}

export function edit(build: () => Command<SceneState>): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  useScenes.getState().runCommand(open.documentId, build())
  return { ok: true }
}

/**
 * The same, for one named node, found before anything runs — a command whose node is gone
 * answers by returning the state untouched, so every miss would otherwise be reported as done.
 */
export function editNode(
  input: Record<string, unknown>,
  build: (node: SceneNode, documentId: string) => Command<SceneState> | null,
  /** What the call answers, read off the node AFTER the command — see `movedOf`. */
  answer?: (node: SceneNode, documentId: string) => unknown,
): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const named = textOf(input, 'nodeId') ?? ''
  const node = nodeAimed(open.state, named)
  // 🛑 Told apart: a node that is not there and an edit with nothing to do read the same as
  // `badInput`, and a client re-sent a `node.remove` whose node it had just removed — 33 refusals
  // on the bench pass of 2026-08-26, none of them saying the object was already gone.
  if (!node) return refused('notFound', noSuchNode(named, open.state.nodes))

  const command = build(node, open.documentId)
  if (!command) return refused('badInput', `"${node.name}" has nothing to change here`)

  useScenes.getState().runCommand(open.documentId, command)
  if (!answer) return { ok: true }

  // Read again rather than computed here: a command may land a KEY rather than a transform, and
  // what the viewport shows is what the caller has to be told.
  const after = nodeById(sceneOf(useScenes.getState(), open.documentId), node.id)
  return after ? { ok: true, data: answer(after, open.documentId) } : { ok: true }
}

/** The three vectors, as the fields of a call name them. */
export const VECTORS: readonly (keyof Transform)[] = ['position', 'rotation', 'scale']
export const AXES = ['X', 'Y', 'Z']

/**
 * 🛑 What a move ANSWERS, and the reason every write answers something: told a bare `ok`, a model
 * re-sent « 50 cm à droite » as 0.5 then as 2.5, three metres off (2026-09-02). The vectors it
 * TOUCHED only — the whole transform is three times the room `RESULT_MAX` leaves.
 */
export function movedOf(
  input: Record<string, unknown>,
  node: SceneNode,
  documentId: string,
): Partial<Transform> {
  const keying = sceneKeyingAt(documentId)
  const pose = poseAt(node.transform, keying.state.animation, node.id, keying.at)

  return composedNamedOf(input, pose, VECTORS, AXES)
}

/** The nodes a `nodeIds` list names, by id or by name — what the two folding handlers aim at. */
export function aimedNodes(state: SceneState, input: Record<string, unknown>): SceneNode[] {
  return textsOf(input, 'nodeIds')
    .map(id => nodeAimed(state, id))
    .filter(node => node !== undefined)
}

/** A vector read three axes at a time, each one falling back to where the node already is. */
export function vectorOf(
  input: Record<string, unknown>,
  of: string,
  current: Vector3,
  relative = false,
): Vector3 {
  const axis = (name: 'x' | 'y' | 'z'): number =>
    composedNumber(
      current[name],
      numberOf(input, `${of}${name.toUpperCase()}`),
      relative,
      of === 'scale' ? 'multiply' : 'add',
    )

  return { x: axis('x'), y: axis('y'), z: axis('z') }
}

/** The specs of one shape, read by name — the tables are keyed by kind and typed per kind. */
export type Specs = { readonly [name: string]: PropertySpec | undefined }

/** Everything a call names apart from the node itself: what the descriptor must answer for. */
export function namedFields(input: Record<string, unknown>): string[] {
  return Object.keys(input).filter(key => key !== 'nodeId' && key !== 'relative')
}

/**
 * Whether a number sits inside what the field's own control enforces — a slider clamps its travel
 * just as the number field clamps its bounds, so both are limits and neither is a suggestion.
 */
export function withinSpec(spec: PropertySpec | undefined, value: number): boolean {
  const bounds = numericBoundsOf(spec)
  return bounds === null || withinBounds(value, bounds)
}

/**
 * The numbers a call writes onto one descriptor, or a refusal. The registry can only publish the
 * UNION over kinds — a torus takes one radial segment where a capsule takes three — so this is
 * where the kind in hand narrows it.
 */
export function numbersFor(
  input: Record<string, unknown>,
  descriptor: object,
  specs: Specs,
): Record<string, number> | null {
  const written: Record<string, number> = {}

  for (const name of namedFields(input)) {
    const value = numberOf(input, name)
    if (value === null || !(name in descriptor) || !withinSpec(specs[name], value)) return null
    written[name] = value
  }

  return written
}

/** The axes of a light's target, which travel as three numbers and land as one field. */
export const TARGET_AXES: readonly string[] = ['targetX', 'targetY', 'targetZ']

/** The three of a rail's point, read the same way. */
export const POINT_AXES: readonly string[] = ['pointX', 'pointY', 'pointZ']

/** The mirror of what `setShadowOn` SKIPS — and a skipped node leaves a command that reads as done. */
export function canShadow(
  node: SceneNode,
  changes: { castShadow?: boolean; receiveShadow?: boolean },
): boolean {
  if (changes.castShadow !== undefined && !canCastShadow(node)) return false
  return changes.receiveShadow === undefined || canReceiveShadow(node)
}

/** A picture named by id, or none — an empty id is the map taken off. */
export function assetRef(input: Record<string, unknown>, key: string): { assetId: string } | null {
  const assetId = textOf(input, key)
  return assetId === null ? null : { assetId }
}

/** The typeface a call names, either half of it, over the one the node already wears. */
export function fontFrom(input: Record<string, unknown>, current: FontRef): FontRef | null {
  const family = textOf(input, 'fontFamily')
  const source = oneOf(input, 'fontSource', FONT_SOURCES)
  if (family === null && source === null) return null

  return { family: family ?? current.family, source: source ?? current.source }
}

/** The map slots a call names, as a material stores them — `null` and absent being two answers. */
export function texturesFrom(
  input: Record<string, unknown>,
): Partial<Record<TextureSlot, { assetId: string } | null>> | null {
  if (input.textures === undefined) return {}

  const asked = recordOf(input, 'textures')
  if (!asked) return null

  const slots: Record<string, { assetId: string } | null> = {}
  for (const [slot, value] of Object.entries(asked)) {
    if (typeof value !== 'string') return null
    slots[slot] = value.trim() === '' ? null : { assetId: value }
  }

  return slots
}

/**
 * The nodes worth answering FIRST — what is chosen, then what an author put there, then the rest.
 *
 * 🛑 `resultLine` gives an over-long list what room is left and drops the tail, so the order here
 * decides what a model gets to see. Left in the document's own order, a scene answered its
 * template's ambient light and nothing else: « place la sphère deux mètres à droite du cube »
 * re-read the same state five times over, measured 2026-09-01.
 */
export function mostWanted(
  nodes: readonly SceneNode[],
  selectedIds: readonly string[],
): SceneNode[] {
  const rank = (node: SceneNode): number => {
    if (selectedIds.includes(node.id)) return 0
    return node.type === 'light' || node.type === 'camera' ? 2 : 1
  }

  // `sort` is stable, so equal ranks keep the document's own order — no tie-breaker needed.
  return [...nodes].sort((one, other) => rank(one) - rank(other))
}

/**
 * What a record holds APART from what a fresh one holds — absent reads as the default.
 *
 * 🛑 The one rule of this answer, and it is measured: `resultLine` cuts by whole members and
 * `nodes` is the only one carrying an id, so every character spent saying « unchanged » is one
 * taken from the objects. A world of 355, a material of 145 of `null`, a sphere of 53 saying it
 * has the segments a sphere always has — a five-object scene answered ONE of them on 2026-09-01.
 */
export function apartFrom<T extends object>(held: T, standing: T): Partial<T> {
  const apart: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(held)) {
    if (JSON.stringify(value) !== JSON.stringify(standing[key as keyof T])) apart[key] = value
  }
  return apart as Partial<T>
}

/**
 * How finely a shape is divided, which changes nothing a request can name.
 *
 * 🛑 The MEASUREMENTS stay, whatever they are: a default sphere's radius of 0.5 is what « fais-le
 * un mètre de large » is computed from, and unlike a colour it cannot be guessed back — a default
 * is per primitive. Only the segment counts go.
 */
export const SEGMENT_FIELDS: readonly string[] = [
  'widthSegments',
  'heightSegments',
  'depthSegments',
  'radialSegments',
  'capSegments',
  'tubularSegments',
  'segments',
  'curveSegments',
]

/** A geometry with the segment counts its own primitive is born with left out. */
export function shapeApart(geometry: GeometryDescriptor): Partial<GeometryDescriptor> {
  const born = primitiveByKind(geometry.kind)?.create()
  if (!born) return geometry

  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(geometry)) {
    const standing = born[key as keyof GeometryDescriptor]
    if (!SEGMENT_FIELDS.includes(key) || value !== standing) kept[key] = value
  }
  return kept as Partial<GeometryDescriptor>
}

/** A record left out entirely when nothing in it differs — `material: {}` says only what absence says. */
export const unlessBare = (key: string, held: object): Record<string, object> =>
  Object.keys(held).length === 0 ? {} : { [key]: held }

/** A list left out entirely when it holds nothing — `shots: []` says only what absence says. */
export const someOrNone = <T>(key: string, items: readonly T[]): Record<string, readonly T[]> =>
  items.length === 0 ? {} : { [key]: items }

/** The cued rows that hold something — four empty lists cost 62 characters saying nothing. */
export function cuesLaid(animation: SceneAnimation): Record<string, unknown> {
  const cues = {
    ...someOrNone('events', animation.events ?? []),
    ...someOrNone('audio', animation.audio ?? []),
    ...someOrNone('video', animation.video ?? []),
    ...someOrNone('transitions', animation.transitions ?? []),
  }
  return Object.keys(cues).length === 0 ? {} : { cues }
}

/**
 * The refusal for a node nobody holds, naming the ones the scene DOES — bounded, so a busy scene
 * does not spend a turn on a list.
 *
 * 🛑 Told only that its word matched nothing, a model invented another: « château », « chevalier »
 * and « caméra » were each aimed at twice over on the pass of 2026-09-01, on a scene holding
 * « Cube Test ». What it needs to correct itself is the names, and it has them in one line.
 */
export function noSuchNode(named: string, nodes: readonly SceneNode[]): string {
  const held = nodes
    .slice(0, NAMES_IN_A_REFUSAL)
    .map(one => `"${one.name}"`)
    .join(', ')
  const rest = nodes.length - Math.min(nodes.length, NAMES_IN_A_REFUSAL)

  return nodes.length === 0
    ? `no node "${named}": the scene in front holds none`
    : `no node "${named}" in the scene in front, by id or name — it holds ${held}${rest > 0 ? `, and ${rest} more` : ''}`
}

/** How many names a refusal spells. Past this a busy scene spends the turn on a list. */
export const NAMES_IN_A_REFUSAL = 8

/** A node's `transform`, or nothing at all when it has not left where a fresh one stands. */
export function moved(transform: Transform): { transform: Partial<Transform> } | null {
  const parts = movedParts(transform)
  return Object.keys(parts).length === 0 ? null : { transform: parts }
}

export function socketIdOf(named: string | null | undefined): string | null {
  if (!named) return null

  const open = Object.values(useCharacters.getState().states).find(one => one.assetId !== '')
  return open?.sockets.find(one => one.name === named || one.id === named)?.id ?? named
}

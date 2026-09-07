import { InstancedMesh, type Box3, type Camera, type Object3D } from 'three'
import type { ShadowThrow } from './grouping'
import {
  EYE,
  FRUSTUM,
  VIEW,
  remeasure,
  seenFrom,
  sweptBy,
  type Held,
} from './cellInstancingGeometry'
import type { CellKey, WorldPartition } from './worldPartition'

/**
 * 🛑 What the last follow was answered for. A camera that has not moved, a cast unchanged and a
 * revision unchanged mean the answer would be the same one — measured at 9,43 ms a frame on 512
 * cells of 8 192 bodies, all in view, which is the whole of what a still frame was paying twice.
 *
 * 🛑 ONE slot, and it must stay one: this is not a cache but « what the cells reflect right now »,
 * `synchronizeStandingCells` having MUTATED their visibility. A slot per camera would answer early
 * for a camera whose cells another has since replaced, and draw a pane from another one's view.
 *
 * The price, in clear: a frame drawing several panes, or a camera preview beside a pane, asks with
 * a different camera each time and touches nothing. The saving is a window showing ONE view —
 * which is the ordinary one, and the only one where the same question was asked twice.
 */
export type FollowMemory = {
  /**
   * 🛑 Bumped by EVERY change a follow would have to see again — a cell born or dropped, a box
   * grown, the reach remeasured. One missed bump is geometry that stops being culled, and the
   * suite cannot see it: no fixture there reads this half of the key.
   */
  revision: number
  answered: number
  cast: ShadowThrow | null | undefined
  view: Float64Array
}

export const newFollowMemory = (): FollowMemory => ({
  revision: 0,
  answered: -1,
  cast: undefined,
  view: new Float64Array(32),
})

type VisibilityContext = {
  host: Object3D
  index: WorldPartition
  cells: Map<CellKey, Held>
  standing: Set<CellKey>
  wanted: Set<CellKey>
  near: CellKey[]
  boxes: WeakMap<InstancedMesh, Box3>
  drawEvery: () => boolean
  /** How far past the eye a cell can still hold something visible — see `measuredReach`. */
  queryReach: number
  memory: FollowMemory
}

export function followCells(
  context: VisibilityContext,
  camera: Camera | null,
  cast: ShadowThrow | null | undefined,
): boolean {
  // Removing far cells avoids 0.97 ms of matrix walking for 6,912 meshes on 500,000 bodies.
  const radius = camera ? seenFrom(camera) + context.queryReach : Infinity
  if (!camera || !Number.isFinite(radius)) return context.drawEvery()
  // Before the comparison, never after: the matrix this reads is the one `prepareCamera` would
  // have refreshed, and comparing a stale one would skip a frame the eye did move on.
  camera.updateWorldMatrix(true, false)
  if (answeredAlready(context, camera, cast)) return false
  rememberAnswer(context, camera, cast)

  prepareCamera(context, camera, radius)
  let moved = synchronizeStandingCells(context)
  FRUSTUM.setFromProjectionMatrix(
    VIEW.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  )
  for (const key of context.standing) moved = cullCell(context, key, cast) || moved
  return moved
}

/** Whether this exact question was answered last frame — see `FollowMemory`. */
function answeredAlready(
  context: VisibilityContext,
  camera: Camera,
  cast: ShadowThrow | null | undefined,
): boolean {
  const held = context.memory
  if (held.answered !== held.revision || held.cast !== cast) return false
  return sameView(held.view, camera)
}

function sameView(held: Float64Array, camera: Camera): boolean {
  for (let at = 0; at < 16; at += 1) {
    if (held[at] !== camera.matrixWorld.elements[at]) return false
    if (held[at + 16] !== camera.projectionMatrix.elements[at]) return false
  }
  return true
}

function rememberAnswer(
  context: VisibilityContext,
  camera: Camera,
  cast: ShadowThrow | null | undefined,
): void {
  const held = context.memory
  held.answered = held.revision
  held.cast = cast
  held.view.set(camera.matrixWorld.elements, 0)
  held.view.set(camera.projectionMatrix.elements, 16)
}

function prepareCamera(context: VisibilityContext, camera: Camera, radius: number): void {
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
  camera.getWorldPosition(EYE)
  context.index.query(EYE.x, EYE.z, radius, context.near)
  context.wanted.clear()
  for (const key of context.near) context.wanted.add(key)
}

function synchronizeStandingCells(context: VisibilityContext): boolean {
  let moved = false
  for (const key of context.near) {
    if (context.standing.has(key)) continue
    const held = context.cells.get(key)
    if (!held) continue
    context.host.add(held.group)
    context.standing.add(key)
    moved = true
  }
  for (const key of context.standing) {
    if (context.wanted.has(key)) continue
    context.cells.get(key)?.group.removeFromParent()
    context.standing.delete(key)
    moved = true
  }
  return moved
}

function cullCell(
  context: VisibilityContext,
  key: CellKey,
  cast: ShadowThrow | null | undefined,
): boolean {
  const held = context.cells.get(key)
  if (!held) return false
  if (held.stale) remeasure(held, context.boxes)
  const inField = FRUSTUM.intersectsBox(sweptBy(held.box, cast))
  let moved = setVisibility(held.group, inField)
  if (!inField) return moved
  for (const child of held.group.children) {
    const box = child instanceof InstancedMesh ? context.boxes.get(child) : undefined
    const draws = box ? FRUSTUM.intersectsBox(sweptBy(box, cast)) : true
    moved = setVisibility(child, draws) || moved
  }
  return moved
}

function setVisibility(object: Object3D, visible: boolean): boolean {
  if (object.visible === visible) return false
  object.visible = visible
  return true
}

import { Vector3, type Camera, type Object3D } from 'three'
import { SCATTER_CATEGORIES, type ScatterCategory } from '@shared/domain/scene'
import { SCATTER_DISTANCE } from '@shared/domain/renderPolicy'
import { MAX_SPATIAL_REACH, type CellKey, type WorldPartition } from './worldPartition'

/** What the pass actually reaches: the scatter's own distance, never further than a query stays spatial. */
const REACH = Math.min(SCATTER_DISTANCE, MAX_SPATIAL_REACH)

type ScatterVisibilityCells = {
  byLayer: Map<string, { category: ScatterCategory; cells: Map<CellKey, Object3D[]> }>
  partitions: Map<ScatterCategory, WorldPartition>
  queried: Map<ScatterCategory, CellKey[]>
  wanted: Map<ScatterCategory, Set<CellKey>>
  visibility: { x: number; z: number; revision: number }
  revision: number
}

const SCATTER_EYE = new Vector3()

export function updateScatterVisibility(cells: ScatterVisibilityCells, camera: Camera): boolean {
  camera.getWorldPosition(SCATTER_EYE)
  if (visibilityIsCurrent(cells, SCATTER_EYE.x, SCATTER_EYE.z)) return false

  queryWantedCells(cells)
  const changed = applyVisibility(cells)
  rememberVisibility(cells, SCATTER_EYE.x, SCATTER_EYE.z)
  return changed
}

function queryWantedCells(cells: ScatterVisibilityCells): void {
  for (const category of SCATTER_CATEGORIES) {
    const queried = cells.queried.get(category) ?? []
    cells.partitions.get(category)?.query(SCATTER_EYE.x, SCATTER_EYE.z, REACH, queried)
    const wanted = cells.wanted.get(category)
    wanted?.clear()
    for (const key of queried) wanted?.add(key)
  }
}

function applyVisibility(cells: ScatterVisibilityCells): boolean {
  let changed = false
  for (const [layerId, layerCells] of cells.byLayer) {
    for (const [key, objects] of layerCells.cells) {
      const visible = cells.wanted.get(layerCells.category)?.has(key) ?? false
      for (const object of objects) {
        if (object.visible === visible) continue
        object.visible = visible
        changed = true
      }
    }
    if (layerCells.cells.size === 0) cells.byLayer.delete(layerId)
  }
  return changed
}

function visibilityIsCurrent(cells: ScatterVisibilityCells, x: number, z: number): boolean {
  const current = cells.visibility
  return current.revision === cells.revision && current.x === x && current.z === z
}

function rememberVisibility(cells: ScatterVisibilityCells, x: number, z: number): void {
  cells.visibility.x = x
  cells.visibility.z = z
  cells.visibility.revision = cells.revision
}

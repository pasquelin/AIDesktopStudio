import { bench } from '@shared/vitestBench'
import { PerspectiveCamera, type Object3D } from 'three'
import { SCATTER_CATEGORIES, type ScatterCategory } from '@shared/domain/scene'
import { updateScatterVisibility } from './scatterVisibility'
import { buildPartition, cellKey, type CellKey } from './worldPartition'

// A 16 × 16 field of 256 m cells — four kilometres a side — with three drawn objects per cell: the
// shape of a scatter layer around a camera, built once, out of the measure.
const SIDE = 16
const cells = fixture(SIDE, 3)
const still = new PerspectiveCamera(60, 16 / 9, 0.1, 1_000)
still.position.set(SIDE * 128, 10, SIDE * 128)
still.updateMatrixWorld(true)
updateScatterVisibility(cells, still)

const walking = new PerspectiveCamera(60, 16 / 9, 0.1, 1_000)
walking.position.set(0, 10, SIDE * 128)
walking.updateMatrixWorld(true)

bench('scatter visibility: the camera has not moved (the memo answers)', () => {
  updateScatterVisibility(cells, still)
})

// What a game pays per frame: its camera follows the player and moves on every one of them.
bench('scatter visibility: the camera moved a step (query and visibility both run)', () => {
  walking.position.x = (walking.position.x + 0.1) % (SIDE * 256)
  walking.updateMatrixWorld(true)
  updateScatterVisibility(cells, walking)
})

function fixture(side: number, perCell: number) {
  const props: ScatterCategory = 'props'
  const partitions = new Map(
    SCATTER_CATEGORIES.map(category => [category, buildPartition(category === 'props' ? 256 : 32)]),
  )
  const partition = partitions.get('props')
  const held = new Map<CellKey, Object3D[]>()
  for (let cx = 0; cx < side; cx += 1) {
    for (let cz = 0; cz < side; cz += 1) {
      const key = cellKey(cx, cz)
      partition?.hold(key)
      held.set(key, objects(perCell))
    }
  }
  return {
    byLayer: new Map([['trees', { category: props, cells: held }]]),
    partitions,
    queried: new Map(SCATTER_CATEGORIES.map(category => [category, [] as CellKey[]])),
    wanted: new Map(SCATTER_CATEGORIES.map(category => [category, new Set<CellKey>()])),
    visibility: { x: 0, z: 0, revision: -1 },
    revision: 1,
  }
}

function objects(count: number): Object3D[] {
  return Array.from({ length: count }, () => ({ visible: true }) as Object3D)
}

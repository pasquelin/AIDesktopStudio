import { bench } from '@shared/vitestBench'
import { BoxGeometry } from 'three'
import { describe } from 'vitest'
import { bodies, host, inOneCell, looking } from './cellInstancing-fixtures'
import { createCellGroups } from './cellInstancing'
import { WORTH_INSTANCING } from './grouping'
import { CELL_SIZE } from './worldPartition'

/**
 * 🛑 The decor is built OUT of the timed section, and `follow` is the whole of what is timed —
 * what a still frame pays to decide again what it decided last frame.
 */
const CELLS = 64
const shape = new BoxGeometry(1, 1, 1)
const places = Array.from({ length: CELLS }, (_unused, at) =>
  inOneCell(WORTH_INSTANCING, at * CELL_SIZE),
).flat()
const { nodes, objects } = bodies(places, shape)
const scene = host()
const groups = createCellGroups(scene)
groups.rebuild(nodes, id => objects.get(id))
const camera = looking(0, 500)
// Settled once: what is timed is the SECOND answer to an unchanged question, not the first.
groups.follow?.(camera, null)

describe(`following ${CELLS} cells of ${WORTH_INSTANCING} bodies from a camera that has not moved`, () => {
  bench('follow, camera and cast both unchanged', () => {
    groups.follow?.(camera, null)
  })
})

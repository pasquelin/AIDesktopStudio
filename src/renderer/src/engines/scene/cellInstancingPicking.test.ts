import { BoxGeometry } from 'three'
import { expect, it } from 'vitest'
import { WORTH_INSTANCING } from './grouping'
import { createCellGroups } from './cellInstancing'
import { CELL_SIZE } from './worldPartition'
import { bodies, host, inOneCell, looking } from './cellInstancing-fixtures'

it('drops the sources of a cell the view no longer stands', () => {
  const scene = host()
  const wide = new BoxGeometry(4 * CELL_SIZE, 1, 4 * CELL_SIZE)
  const places = [
    ...inOneCell(WORTH_INSTANCING / 2, 3 * CELL_SIZE),
    ...inOneCell(WORTH_INSTANCING / 2, 20 * CELL_SIZE),
  ]
  const { nodes, objects } = bodies(places, wide)
  const groups = createCellGroups(scene)
  groups.rebuild(nodes, id => objects.get(id))
  groups.follow?.(looking(0, 500))

  // What the editor casts against is what the view stands: a click on empty space must not
  // select a body the follow put away and nothing draws.
  expect(groups.pickable()).toHaveLength(1)
  expect(groups.editorPickable()).toHaveLength(WORTH_INSTANCING / 2)
})

it('counts the sources it would hand the picker, never the ones the view dropped', () => {
  const scene = host()
  const wide = new BoxGeometry(4 * CELL_SIZE, 1, 4 * CELL_SIZE)
  const places = [
    ...inOneCell(WORTH_INSTANCING / 2, 3 * CELL_SIZE),
    ...inOneCell(WORTH_INSTANCING / 2, 20 * CELL_SIZE),
  ]
  const { nodes, objects } = bodies(places, wide)
  const groups = createCellGroups(scene)
  groups.rebuild(nodes, id => objects.get(id))
  groups.follow?.(looking(0, 500))

  // Counted over every swept source, a level whose camera stands 3 000 of 200 000 bodies read
  // 200 000 and flipped the adaptive threshold to the lots the identity path was measured against.
  expect(groups.editorSourceCount()).toBe(groups.editorPickable().length)
})

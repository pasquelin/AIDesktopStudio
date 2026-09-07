import { expect, it } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { meshNode } from './scene-fixtures'
import { bakedRuntimeNodes } from './bakedRuntimeNodes'
import type { SceneNode } from './sceneState'

it('restores baked source identities as logical children for runtime systems', () => {
  const baked: SceneNode = {
    ...meshNode('baked'),
    instances: [
      { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
      { sourceId: 'second', name: 'Second', transform: IDENTITY_TRANSFORM },
    ],
  }

  expect(bakedRuntimeNodes([baked]).map(node => [node.id, node.parentId])).toEqual([
    ['baked', null],
    ['first', 'baked'],
    ['second', 'baked'],
  ])
})

// SPDX-License-Identifier: MIT

import { expect, it } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { DEFAULT_PLAY } from '@shared/domain/scene'
import { createCharacters } from './characters'
import { restingTransform } from './entity'
import { createIntents } from './intents'
import { createPossessions } from './possessions'
import { reading } from './input-fixtures'
import { testWorld } from './world-fixtures'

it('faces the view in first person while moving sideways', () => {
  const world = testWorld({ play: { ...DEFAULT_PLAY, camera: 'firstPerson', moveSpeed: 4 } })
  world.entities.add({
    id: 'walker',
    name: 'Walker',
    transform: restingTransform(),
    components: [{ ...newComponent('CharacterController'), bodyTurnSpeed: 720 }],
  })
  const characters = createCharacters(
    createPossessions(),
    entity => entity.transform,
    createIntents(),
  )
  world.input = reading({ held: ['KeyD'] })
  for (let step = 0; step < 60; step++) characters.intents(world, 1 / 60)
  const [move] = characters.intents(world, 1 / 60)
  expect(move?.wanted.x).toBeGreaterThan(0)
  expect(move?.facing).toBeCloseTo(characters.look().yaw)
})

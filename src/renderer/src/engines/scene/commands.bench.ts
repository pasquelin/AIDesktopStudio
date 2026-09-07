import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import type { Command } from '../core/history'
import { moveNodes, setShadowOn } from './commands'
import { meshNodes, spriteNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, IDENTITY_TRANSFORM, type SceneState } from './sceneState'

/**
 * What ONE image of a gesture costs the window holding it: a drag emits a command per frame, so
 * this is a 16 ms budget rather than a one-off. Both halves of the image are timed, because both
 * used to walk the whole scene once per node touched.
 */

/** What `run` does with a command, and in that order: a refusal never reaches `apply`. */
function frame(state: SceneState, command: Command<SceneState>): void {
  if (command.refuses?.(state)) return
  command.apply(state)
}

describe('one image of a gesture over a selection', () => {
  // Sprites, and nothing else: turning one shows only when something hangs from it, which is a
  // question about the WHOLE scene — the one a mesh never asks. The index of parents is warm from
  // the second image here, where a drag rebuilds it every one: this catches the regression, not
  // the absolute.
  const sprites = Array.from({ length: 200 }, (_unused, index) =>
    spriteNodeFixture(`sprite_${index}`),
  )
  const spriteScene: SceneState = { ...EMPTY_SCENE, nodes: [...sprites, ...meshNodes(39_800)] }
  const swung = sprites.map(node => ({
    id: node.id,
    transform: { ...IDENTITY_TRANSFORM, position: { x: 1, y: 0, z: 0 } },
  }))

  bench('moving 200 sprites of 40000', () => {
    frame(spriteScene, moveNodes(swung))
  })

  for (const total of [2_000, 40_000]) {
    const nodes = meshNodes(total)
    const state: SceneState = { ...EMPTY_SCENE, nodes }
    const again = moveNodes(
      nodes.slice(0, 1).map(node => ({ id: node.id, transform: node.transform })),
    )

    // The other half of a gesture: a value the node already carries, which the eye of the outliner
    // clicked back and a drag on a held axis both send. The walk has to stop at the node.
    bench(`re-sending what one of ${total} carries`, () => {
      frame(state, again)
    })

    for (const count of [10, 200, 2_000]) {
      const picked = state.nodes.slice(0, count)
      const moved = picked.map(node => ({
        id: node.id,
        transform: { ...IDENTITY_TRANSFORM, position: { x: 1, y: 0, z: 0 } },
      }))

      bench(`moving ${count} of ${total}`, () => {
        frame(state, moveNodes(moved))
      })

      bench(`shadowing ${count} of ${total}`, () => {
        frame(state, setShadowOn(picked, { castShadow: false }))
      })
    }
  }
})

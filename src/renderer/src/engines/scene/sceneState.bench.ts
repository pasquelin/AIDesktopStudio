import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { meshNodes } from './scene-fixtures'
import { selectedNodes } from './sceneState'

/**
 * What reading the scene by id costs the readers that share its index. Warm from the second
 * iteration, as `commands.bench` is: this catches a lookup gone linear, never the build — see
 * `byIdOf`, which carries what one image actually pays.
 */
describe('the selection, read off the scene', () => {
  for (const total of [2_000, 40_000]) {
    const nodes = meshNodes(total)

    for (const count of [1, 200]) {
      const ids = nodes.slice(0, count).map(node => node.id)

      bench(`${count} of ${total}`, () => {
        selectedNodes(nodes, ids)
      })
    }
  }
})

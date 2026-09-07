import { describe, expect, it } from 'vitest'
import { newComponent, withComponentField } from '@shared/domain/componentRegistry'
import { createExportHost } from '@game/host/exportHost'
import { loadQuickjsScripts } from '@game/host/quickjsScripts'
import { notedPhysics } from '@game/physics/physics-fixtures'
import type { GameApi } from '@game/api/gameApi'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { worldFromScene } from './worldFromScene'

const HOST = {
  input: new EventTarget(),
  player: { id: 'p1', name: 'Alba', local: true },
  files: {},
}

/**
 * 🛑 The one thing no unit test of the lot could reach: that the store a SCRIPT writes is the
 * store the CONTROLLERS read. Two `createIntents()` instead of one leaves every other suite green
 * and the feature dead in the product.
 */
describe('what a script asks, reaching the body it sits on', () => {
  const walker = (): SceneState => ({
    ...EMPTY_SCENE,
    nodes: [
      {
        ...meshNode('walker'),
        name: 'Walker',
        components: [
          newComponent('CharacterController'),
          withComponentField(newComponent('Script'), 'script', 'script:Drive.ts'),
        ],
      },
    ],
  })

  it('walks the body a script asked for, through the whole assembly', async () => {
    const physics = notedPhysics()
    // 🛑 A REAL sandbox: `createExportHost` installs an inert one, which runs no script at all.
    const script = await loadQuickjsScripts()
    const ports: GameApi = { ...createExportHost(HOST), physics, script }
    const world = worldFromScene('doc-1', walker(), ports, {
      modules: [
        {
          script: 'script:Drive.ts',
          code: 'exports.default = defineScript({ onUpdate(self) { self.walk(1, 0) } })',
        },
      ],
    })
    // 🛑 Whole FRAMES, never a run of bare steps: the script budget is four milliseconds of wall
    // clock and `script.ts` refills it in `lateUpdate`. Thirty steps in a row spend it once and
    // the sandbox stops running — green alone, red under a loaded suite.
    for (let frame = 0; frame < 30; frame++) {
      world.step(1 / 60)
      world.lateUpdate(0, 1 / 60)
    }

    expect(physics.asked.at(-1)?.wanted.x).toBeGreaterThan(0)
    world.dispose()
  })
})

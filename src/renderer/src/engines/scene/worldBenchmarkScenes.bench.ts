import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { createRuntimeWorldCompiler } from './runtimeWorldCompiler'
import { worldBenchmarkScenes } from './worldBenchmarkScenes.fixture'
import { buildGameScene } from '@/game/gameScene'
import type { AssetPort } from '@game/ports/assetPort'
import { drawnBy, handDriven } from '@/game/game-fixtures'
import { startPlay } from '@/game/playSession'
import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera } from 'three'
import { createCellGroups } from './cellInstancing'

const NO_ASSETS: AssetPort = { urlOf: () => null }

for (const scenario of worldBenchmarkScenes()) {
  describe(`${scenario.id}: ${scenario.purpose}`, () => {
    bench('compiles the authoring world', () => {
      createRuntimeWorldCompiler().compileRuntimeWorld(scenario.state)
    })

    // Named for everything it holds. `buildGameScene` hands back nothing narrower to time, and
    // `dispose` walks the whole tree releasing geometries and materials — measuring the build
    // alone would leave one scene per iteration behind.
    bench('builds and releases the optimized render representation', async () => {
      const runtime = await buildGameScene(scenario.state, NO_ASSETS)
      runtime.dispose()
    })
  })
}

const city = worldBenchmarkScenes().find(scenario => scenario.id === 'S4')
if (city) {
  const host = new Object3D()
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const objects = new Map(
    city.state.nodes.map(node => {
      const object = new Mesh(geometry, material)
      object.position.set(
        node.transform.position.x,
        node.transform.position.y,
        node.transform.position.z,
      )
      object.updateMatrixWorld(true)
      return [node.id, object]
    }),
  )
  const groups = createCellGroups(host)
  groups.rebuild(city.state.nodes, id => objects.get(id))
  host.updateMatrixWorld(true)
  const camera = new PerspectiveCamera(60, 1, 0.1, 1_000)
  let side = 1

  describe('S4: city camera culling', () => {
    bench('updates spatial cells against the camera frustum', () => {
      side *= -1
      camera.position.set(side * 100, 30, 100)
      camera.lookAt(100, 0, 50)
      camera.updateMatrixWorld(true)
      groups.follow?.(camera, null)
    })
  })
}

const mixed = worldBenchmarkScenes().find(scenario => scenario.id === 'S5')
if (mixed) {
  describe('S5: one mixed gameplay frame', () => {
    bench('starts, steps, draws and disposes the runtime', () => {
      const frames = handDriven()
      let cpuFrameMs = 0
      const session = startPlay({
        documentId: 'benchmark',
        renderer: drawnBy(),
        editState: () => mixed.state,
        input: new EventTarget(),
        frames: frames.driver,
        onReport: report => {
          cpuFrameMs = report.performance.cpuFrameMs
        },
      })
      frames.advance(0)
      frames.advance(1 / 60)
      void cpuFrameMs
      session.stop()
    })
  })
}

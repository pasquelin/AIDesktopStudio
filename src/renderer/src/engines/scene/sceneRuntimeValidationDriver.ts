import type { SceneState } from './sceneState'
import { SceneRenderer, type SceneRendererOptions } from './SceneRenderer'
import type {
  RuntimeRenderCamera,
  RuntimeValidationDriver,
} from './runtimeRepresentationValidation'
import {
  executeRuntimeFunctionalChecks,
  type ExecutedChecks,
  type RuntimeFunctionalValidationOptions,
} from './executedRuntimeValidation'
import type { RenderedRuntimeSnapshot } from './sceneRuntimeSnapshot'

/** What a mounted engine shows, with the five checks a real run OVERWRITES by executing them. */
export type SceneRuntimeObservation = Omit<RenderedRuntimeSnapshot, keyof ExecutedChecks> &
  ExecutedChecks

export type SceneRuntimeValidationRepresentation = {
  engine: SceneRenderer
  host: HTMLDivElement
  optimized: boolean
  world: SceneState
}

export type SceneRuntimeValidationDriverOptions = {
  cameras: readonly RuntimeRenderCamera[]
  renderer?: Omit<SceneRendererOptions, 'onSelect' | 'onTransform' | 'chrome'>
  settle?: (engine: SceneRenderer, world: SceneState) => Promise<void>
  functional?: RuntimeFunctionalValidationOptions
}

const OFFSCREEN_HOST_OFFSET_PX = -100_000

export function createSceneRuntimeValidationDriver(
  options: SceneRuntimeValidationDriverOptions,
): RuntimeValidationDriver<SceneRuntimeValidationRepresentation, SceneRuntimeObservation> {
  const build = async (
    world: SceneState,
    optimization: 'auto' | 'off',
  ): Promise<SceneRuntimeValidationRepresentation> => {
    const host = document.createElement('div')
    host.style.position = 'fixed'
    host.style.left = `${OFFSCREEN_HOST_OFFSET_PX}px`
    host.style.top = '0'
    host.style.width = `${Math.max(...options.cameras.map(camera => camera.width))}px`
    host.style.height = `${Math.max(...options.cameras.map(camera => camera.height))}px`
    document.body.appendChild(host)
    const engine = new SceneRenderer({
      ...options.renderer,
      onSelect: () => {},
      onTransform: () => {},
      chrome: false,
      optimization,
    })
    try {
      engine.mount(host)
      engine.apply(world)
      if (options.settle) await options.settle(engine, world)
      await paintedFrame()
      return { engine, host, optimized: optimization === 'auto', world }
    } catch (error: unknown) {
      engine.dispose()
      host.remove()
      throw error
    }
  }

  return {
    buildOriginal: async world => await build(world, 'off'),
    buildOptimized: async world => await build(world, 'auto'),
    render: async (representation, camera) =>
      await representation.engine.captureRuntimeValidationFrame(camera),
    observe: async representation => ({
      ...representation.engine.runtimeValidationSnapshot(),
      ...(await executeRuntimeFunctionalChecks(representation.world, options.functional)),
    }),
    dispose: representation => {
      representation.engine.dispose()
      representation.host.remove()
    },
  }
}

async function paintedFrame(): Promise<void> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

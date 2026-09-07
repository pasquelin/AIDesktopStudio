// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_SCENE, type SceneState } from './sceneState'
import type { RuntimeWorld } from './runtimeWorldCompiler'
import type { RuntimeRenderCamera } from './runtimeRepresentationValidation'
import type { SafeRuntimeSnapshot } from './safeRuntimeValidation'
import type { VisualFrame } from './visualRegression'

const calls = vi.hoisted(() => ({
  applied: [] as SceneState[],
  disposed: 0,
  captured: [] as RuntimeRenderCamera[],
  optimizations: [] as ('auto' | 'off' | undefined)[],
}))

const FRAME: VisualFrame = {
  width: 1,
  height: 1,
  pixels: new Uint8Array([12, 34, 56, 255]),
}

const SNAPSHOT: SafeRuntimeSnapshot = {
  picking: [],
  animation: [],
  timeline: [],
  scripts: [],
  physics: [],
  shadows: [],
  cameras: [],
  visibility: [],
  postProcessing: [],
  transforms: [],
  duplication: [],
  undoRedo: [],
}

vi.mock('./SceneRenderer', () => ({
  SceneRenderer: class {
    constructor(options: { optimization?: 'auto' | 'off' }) {
      calls.optimizations.push(options.optimization)
    }

    mount(host: HTMLElement): void {
      host.appendChild(document.createElement('canvas'))
    }

    apply(state: SceneState): void {
      calls.applied.push(state)
    }

    async captureRuntimeValidationFrame(camera: RuntimeRenderCamera): Promise<VisualFrame> {
      calls.captured.push(camera)
      return FRAME
    }

    runtimeValidationSnapshot(): SafeRuntimeSnapshot {
      return SNAPSHOT
    }

    dispose(): void {
      calls.disposed += 1
    }
  },
}))

import { createSceneRuntimeValidationDriver } from './sceneRuntimeValidationDriver'

const CAMERA: RuntimeRenderCamera = {
  id: 'front',
  position: { x: 0, y: 0, z: 10 },
  target: { x: 0, y: 0, z: 0 },
  projection: 'perspective',
  fieldOfView: 50,
  near: 0.1,
  far: 100,
  width: 64,
  height: 32,
  cameraMask: 1,
}

const sourceScene = (): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [
    {
      id: 'group',
      parentId: null,
      name: 'Group',
      type: 'group',
      visible: true,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      castShadow: false,
      receiveShadow: false,
    },
  ],
})

async function afterNextFrame<T>(
  build: () => Promise<T>,
  frames: FrameRequestCallback[],
): Promise<T> {
  let settled = false
  const building = build().then(value => {
    settled = true
    return value
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(settled).toBe(false)
  frames.shift()?.(0)
  return building
}

describe('scene runtime validation driver', () => {
  afterEach(() => {
    calls.applied.length = 0
    calls.captured.length = 0
    calls.disposed = 0
    calls.optimizations.length = 0
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('disposes a representation whose construction fails before it can be returned', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    const driver = createSceneRuntimeValidationDriver({
      cameras: [CAMERA],
      settle: async () => {
        throw new Error('asset failed')
      },
    })

    await expect(driver.buildOriginal(EMPTY_SCENE)).rejects.toThrow('asset failed')
    expect(calls.disposed).toBe(1)
    expect(document.body.querySelectorAll('div')).toHaveLength(0)
  })

  it('mounts isolated source and compiled representations for real renderer capture', async () => {
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    const source = sourceScene()
    const runtime: RuntimeWorld = { ...source, runtimeOptimization: { artifacts: [] } }
    const driver = createSceneRuntimeValidationDriver({ cameras: [CAMERA] })

    const original = await afterNextFrame(() => driver.buildOriginal(source), frames)
    const optimized = await afterNextFrame(() => driver.buildOptimized(runtime), frames)

    expect(calls.applied[0]).toBe(source)
    expect(calls.applied[1]).toBe(runtime)
    expect(calls.optimizations).toEqual(['off', 'auto'])
    expect(original.optimized).toBe(false)
    expect(optimized.optimized).toBe(true)
    expect(original.host.style.width).toBe('64px')
    expect(original.host.style.height).toBe('32px')
    expect(requestFrame).toHaveBeenCalledTimes(2)
    expect(await driver.render(optimized, CAMERA)).toBe(FRAME)
    expect(calls.captured).toEqual([CAMERA])
    expect(await driver.observe(original)).toMatchObject({
      picking: [],
      duplication: { freshIds: true },
    })
    expect(document.body.querySelectorAll('div')).toHaveLength(2)

    driver.dispose(original)
    driver.dispose(optimized)
    expect(calls.disposed).toBe(2)
    expect(document.body.querySelectorAll('div')).toHaveLength(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { PCFShadowMap } from 'three'
import type { Object3D, Scene } from 'three'
import type * as ThreeModule from 'three'
import { DEFAULT_RENDER_POLICY, type RenderPolicy } from '@shared/domain/renderPolicy'
import { lightNode, meshNode } from '@/engines/scene/nodeFactory'
import { at, BOX, NOTHING, sceneOf, SUN } from './game-fixtures'
import { createWebRender } from './webRender'

/**
 * Enough of `WebGLRenderer` for what a game asks of it: jsdom has no WebGL. `render` keeps to the
 * letter of `WebGLShadowMap.render` — a pass runs on `needsUpdate`, draws the lights that owe one,
 * and says so no more.
 */
const fake = vi.hoisted(() => {
  type Shadow = { autoUpdate: boolean; needsUpdate: boolean; mapSize: { width: number } }
  const casting = (object: object): object is { shadow: Shadow } =>
    'shadow' in object && typeof object.shadow === 'object' && object.shadow !== null
  class FakeRenderer {
    shadowMap = { enabled: false, type: 1, autoUpdate: true, needsUpdate: false }
    toneMapping = 0
    toneMappingExposure = 1
    autoClear = true
    ratio = 1
    frames: unknown[] = []
    lenses: number[] = []
    passes = 0
    mapsDrawn = 0
    setPixelRatio(ratio: number): void {
      this.ratio = ratio
    }
    getPixelRatio(): number {
      return this.ratio
    }
    setSize(): void {}
    dispose(): void {}
    render(
      scene: { traverse: (visit: (object: object) => void) => void },
      camera: { fov: number },
    ): void {
      const drawing =
        this.shadowMap.enabled && (this.shadowMap.autoUpdate || this.shadowMap.needsUpdate)
      if (drawing) {
        this.passes += 1
        this.shadowMap.needsUpdate = false
        scene.traverse(object => {
          if (!casting(object)) return
          if (object.shadow.autoUpdate || object.shadow.needsUpdate) this.mapsDrawn += 1
          object.shadow.needsUpdate = false
        })
      }
      this.frames.push(scene)
      this.lenses.push(camera.fov)
    }
  }
  const renderers: FakeRenderer[] = []
  return {
    renderers,
    WebGLRenderer: class extends FakeRenderer {
      constructor() {
        super()
        renderers.push(this)
      }
    },
  }
})

vi.mock('three', async importOriginal => ({
  ...(await importOriginal<typeof ThreeModule>()),
  WebGLRenderer: fake.WebGLRenderer,
}))

/** A canvas in name only: nothing here reads it, and the node project has no DOM to make one. */
const CANVAS: HTMLCanvasElement = Object.create(null)

async function stagedGame(policy: Partial<RenderPolicy> = DEFAULT_RENDER_POLICY) {
  const crate = meshNode(BOX, { name: 'Crate', transform: at(1, 0.5, 1) })
  const render = createWebRender(CANVAS, NOTHING, policy)
  const renderer = fake.renderers[fake.renderers.length - 1]
  if (!renderer) throw new Error('no renderer was built')
  await render.show(sceneOf([crate, lightNode(SUN, { x: 0, y: 4, z: 0 })]))
  render.resize(640, 360)
  render.view({ position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } })
  return { render, renderer, crate }
}

const sunOf = (scene: unknown): { shadow: { camera: { right: number; far: number } } } => {
  let found: Object3D | null = null
  ;(scene as Scene).traverse(object => {
    if ('isDirectionalLight' in object) found = object
  })
  if (!found) throw new Error('no sun in the frame')
  return found
}

describe('what an exported game pays for an image', () => {
  it('tells the renderer the policy — on or off, the filter, and never three.js own redraw', async () => {
    const { renderer } = await stagedGame({ ...DEFAULT_RENDER_POLICY, shadowQuality: 'soft' })

    expect(renderer.shadowMap.enabled).toBe(true)
    expect(renderer.shadowMap.type).toBe(PCFShadowMap)
    expect(renderer.shadowMap.autoUpdate).toBe(false)
  })

  it('fills what an older export left out of its policy, rather than framing on undefined', async () => {
    const { render, renderer } = await stagedGame({ shadows: true, quality: 'performance' })
    render.draw()

    const camera = sunOf(renderer.frames[0]).shadow.camera
    expect(Number.isFinite(camera.right) && camera.right > 0).toBe(true)
    expect(Reflect.get(sunOf(renderer.frames[0]).shadow, 'mapSize')).toMatchObject({ width: 512 })
  })

  it('holds the pixel ratio to what the quality level pays for, and to the screen', async () => {
    Object.defineProperty(globalThis, 'devicePixelRatio', { value: 2, configurable: true })
    const cheap = await stagedGame({ ...DEFAULT_RENDER_POLICY, quality: 'performance' })
    const fine = await stagedGame({ ...DEFAULT_RENDER_POLICY, quality: 'high' })

    expect(cheap.renderer.ratio).toBe(1)
    expect(fine.renderer.ratio).toBe(2)
  })

  it('draws the first frame with every map sized to the policy, then nothing while nothing moves', async () => {
    const { render, renderer } = await stagedGame({ ...DEFAULT_RENDER_POLICY, shadowMapSize: 1024 })

    render.draw()
    render.draw()
    render.draw()

    expect(renderer.frames).toHaveLength(1)
    expect(renderer.passes).toBe(1)
    expect(renderer.mapsDrawn).toBe(1)
    const sun = sunOf(renderer.frames[0])
    expect(Reflect.get(sun.shadow, 'mapSize')).toMatchObject({ width: 1024 })
    expect(Number.isFinite(sun.shadow.camera.right)).toBe(true)
  })

  it('draws again with a depth pass once an entity moved, and not for the same pose again', async () => {
    const { render, renderer, crate } = await stagedGame()
    render.draw()

    render.place([{ entity: crate.id, transform: at(2, 0.5, 1) }])
    render.draw()
    render.place([{ entity: crate.id, transform: at(2, 0.5, 1) }])
    render.draw()

    expect(renderer.frames).toHaveLength(2)
    expect(renderer.passes).toBe(2)
  })

  it('draws again on an eye that moved, without a depth pass, and not on the same eye again', async () => {
    const { render, renderer } = await stagedGame()
    render.draw()

    render.view({ position: { x: 3, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } })
    render.draw()
    render.view({ position: { x: 3, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } })
    render.draw()

    expect(renderer.frames).toHaveLength(2)
    expect(renderer.passes).toBe(1)
  })

  /** A shot through a camera node draws through ITS lens; one from a pair of feet, the author's. */
  it('draws through the lens a shot carries, and back through the policy without one', async () => {
    const { render, renderer } = await stagedGame({ ...DEFAULT_RENDER_POLICY, fieldOfView: 60 })
    const shot = { position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 } }
    render.draw()

    render.view({ ...shot, fieldOfView: 35 })
    render.draw()
    render.view({ ...shot, fieldOfView: 35 })
    render.draw()
    render.view(shot)
    render.draw()

    expect(renderer.lenses).toEqual([60, 35, 60])
  })

  /** Loaded into a set flown by hand, a game must not go on drawing through the last node's lens. */
  it('draws through the policy again once the scene is flown by hand', async () => {
    const { render, renderer } = await stagedGame({ ...DEFAULT_RENDER_POLICY, fieldOfView: 60 })
    render.view({ position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 }, fieldOfView: 35 })
    render.draw()

    render.view(null)
    render.draw()
    render.view(null)
    render.draw()

    expect(renderer.lenses).toEqual([35, 60])
  })

  it('draws again on a size that changed, and on a veil that moved', async () => {
    const { render, renderer } = await stagedGame()
    render.draw()

    render.resize(800, 600)
    render.draw()
    render.veil(0.5)
    render.draw()
    render.veil(0.5)
    render.draw()

    // The veiled frame draws the scene and the sheet over it: two calls for one picture.
    expect(renderer.frames).toHaveLength(4)
    expect(renderer.passes).toBe(1)
  })

  it('refits the frustum once a caster walked past what it was cut to', async () => {
    const { render, renderer, crate } = await stagedGame()
    render.draw()
    const before = sunOf(renderer.frames[0]).shadow.camera.right

    render.place([{ entity: crate.id, transform: at(100, 0.5, 1) }])
    render.draw()

    expect(sunOf(renderer.frames[1]).shadow.camera.right).toBeGreaterThan(before)
    expect(renderer.passes).toBe(2)
  })

  it('poses nothing for a head that has not moved', async () => {
    const { render, renderer } = await stagedGame()
    render.draw()

    render.seek(0)
    render.seek(0)
    render.draw()

    expect(renderer.frames).toHaveLength(1)
  })
})

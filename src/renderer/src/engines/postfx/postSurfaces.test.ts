import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Camera, Scene, type Vector4, WebGLRenderer, WebGLRenderTarget } from 'three'
import type * as Three from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js'
import { postEffect } from '@shared/domain/postProcessing'
import { PostComposer, type PostDrawJob } from './PostComposer'

vi.mock('three', async importOriginal => ({
  ...(await importOriginal<typeof Three>()),
  WebGLRenderer: class {
    getPixelRatio = () => 2
    getRenderTarget = () => null
    getScissorTest = () => false
    getViewport = (target: Vector4) => target.set(0, 0, 960, 640)
    getScissor = (target: Vector4) => target.set(0, 0, 960, 640)
    setRenderTarget = () => {}
    setViewport = () => {}
    setScissor = () => {}
    setScissorTest = () => {}
  },
}))

const stack = {
  enabled: true,
  effects: [postEffect('glow', 'bloom'), postEffect('grade', 'colorGrading')],
}
const resources = new Set<PostComposer>()

/** A distinct shape key per index, so a new chain cannot reuse the spare through `spare(key)`. */
function glitchAt(index: number) {
  return { enabled: true, effects: [postEffect(`glitch-${index}`, 'glitch')] }
}

function composer(): PostComposer {
  const result = new PostComposer(new WebGLRenderer())
  resources.add(result)
  return result
}

function job(surface: string, width: number, height: number): PostDrawJob {
  return {
    surface,
    scene: new Scene(),
    camera: new Camera(),
    stack,
    target: null,
    width,
    height,
    quality: 'high',
    toneMapped: false,
    time: 0,
  }
}

beforeEach(() => {
  vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(() => {})
  vi.spyOn(OutputPass.prototype, 'render').mockImplementation(() => {})
})

afterEach(() => {
  for (const resource of resources) resource.dispose()
  resources.clear()
  vi.restoreAllMocks()
})

describe('post-processing surface resources', () => {
  it('keeps warmed buffers when a pane and its smaller preview alternate', () => {
    const post = composer()
    const pane = job('pane:0', 960, 640)
    const inset = job('inset', 320, 192)
    post.draw(pane)
    post.draw(inset)
    const freed = vi.spyOn(WebGLRenderTarget.prototype, 'dispose')

    for (let frame = 0; frame < 3; frame++) {
      post.draw(pane)
      post.draw(inset)
    }

    expect(freed).not.toHaveBeenCalled()
  })

  it('resizes a surface in place and propagates its size to each effect only once', () => {
    const post = composer()
    const pane = job('pane:0', 960, 640)
    post.draw(pane)
    const resized = vi.spyOn(UnrealBloomPass.prototype, 'setSize')
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')

    post.draw({ ...pane, width: 1200, height: 800 })

    expect(resized.mock.calls).toEqual([[1200, 800]])
    expect(dropped).not.toHaveBeenCalled()
  })

  it('initializes effects in device pixels without applying the renderer ratio twice', () => {
    const resized = vi.spyOn(UnrealBloomPass.prototype, 'setSize')

    composer().draw(job('pane:0', 960, 640))

    expect(resized.mock.calls).toEqual([[960, 640]])
  })

  it('releases all surface chains when their stack is no longer live', () => {
    const post = composer()
    post.draw(job('pane:0', 960, 640))
    post.draw(job('inset', 320, 192))
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')

    post.sweep([stack])
    expect(dropped).not.toHaveBeenCalled()
    post.sweep([])
    expect(dropped).toHaveBeenCalledTimes(2)
    post.dispose()
    expect(dropped).toHaveBeenCalledTimes(2)
  })

  // Named for what it measures: eviction skips bound chains, so `SWEEP_ABOVE` is a sweep
  // threshold for spares and not a cap — only a surface going away frees a chain in use.
  it('never evicts a chain a surface still uses, and frees one only when its surface goes', () => {
    const post = composer()
    for (let index = 0; index < 6; index++) post.draw(job(`surface:${index}`, 64 + index * 16, 64))
    post.draw(job('surface:0', 64, 64))
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')

    post.draw(job('surface:6', 160, 64))
    expect(dropped).not.toHaveBeenCalled()
    post.draw(job('surface:0', 64, 64))
    expect(dropped).not.toHaveBeenCalled()
    post.releaseSurface('surface:1')
    expect(dropped).toHaveBeenCalledTimes(1)
    post.dispose()
    expect(dropped).toHaveBeenCalledTimes(7)
  })

  it('sweeps a spare no binding came back to, once the threshold is crossed', () => {
    const post = composer()
    // Two surfaces of the SAME key at different sizes, then one joins the other: the chain it
    // left keeps zero users and is the spare only `evict` can free.
    post.draw(job('pane:0', 960, 640))
    post.draw(job('inset', 320, 192))
    post.draw(job('inset', 960, 640))
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')

    for (let index = 0; index < 6; index++) {
      post.draw({ ...job(`other:${index}`, 64 + index * 16, 64), stack: glitchAt(index) })
    }

    expect(dropped).toHaveBeenCalled()
  })

  it('releases a closed surface without discarding the live pane', () => {
    const post = composer()
    post.draw(job('pane:0', 960, 640))
    post.draw(job('offscreen', 3840, 2160))
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')

    post.releaseSurface('offscreen')
    expect(dropped).toHaveBeenCalledTimes(1)
    post.draw(job('pane:0', 960, 640))
    post.releaseSurface('offscreen')
    expect(dropped).toHaveBeenCalledTimes(1)
    post.dispose()
    expect(dropped).toHaveBeenCalledTimes(2)
  })

  it('shares equal-size stateless chains and reuses passes through repeated splitter changes', () => {
    const post = composer()
    const resized = vi.spyOn(UnrealBloomPass.prototype, 'setSize')
    post.draw(job('pane:0', 960, 640))
    post.draw(job('inset', 960, 640))
    expect(new Set(resized.mock.contexts).size).toBe(1)

    for (let frame = 0; frame < 3; frame++) {
      post.draw(job('inset', 320 + frame, 192))
      post.draw(job('pane:0', 960, 640))
      post.draw(job('inset', 960, 640))
    }

    expect(new Set(resized.mock.contexts).size).toBe(2)
    const dropped = vi.spyOn(EffectComposer.prototype, 'dispose')
    post.releaseSurface('inset')
    post.draw(job('pane:0', 960, 640))
    expect(dropped).not.toHaveBeenCalled()
  })

  it('keeps a private temporal chain per surface so glitch cadence stays theirs', () => {
    const post = composer()
    const glitchStack = { enabled: true, effects: [postEffect('glitch', 'glitch')] }
    const disposed = vi.spyOn(GlitchPass.prototype, 'dispose')
    post.draw({ ...job('pane:0', 960, 640), stack: glitchStack })
    post.draw({ ...job('inset', 320, 192), stack: glitchStack })
    post.dispose()
    expect(disposed).toHaveBeenCalledTimes(2)
  })
})

/**
 * The Advanced engine's composition chain: a `RenderPipeline` of TSL nodes, where the Compatible
 * one builds an `EffectComposer` of GLSL passes.
 *
 * 🛑 NO fusion pass here, and that is not an omission. `fuseShader` exists on the GL side to
 * share bandwidth between hand-written passes; `RenderPipeline` already shares depth and normals
 * between the nodes that read them, so writing one would be work for nothing.
 *
 * Only the effects the registry says this engine can build enter the chain — the others are left
 * out rather than refused: a stack carries what a document says, and an engine cannot make a
 * document wrong.
 */
import { Vector4, type WebGLRenderTarget } from 'three'
import type { RenderTarget, WebGPURenderer } from 'three/webgpu'
import {
  planStack,
  POST_EFFECTS,
  stackShapeKey,
  type PostEffect,
} from '@shared/domain/postProcessing'
import { paramNumber } from '../postfx/uniforms'
import { heaviestCost } from '../postfx/postPlan'
import { gpuBudgetFor, gpuSamplesOf, type GpuBudget } from './gpuPostQuality'
import type { GpuModule } from './gpuModule'
import { drawInto } from './renderDriver'
import type { ComposerJob, SceneComposer } from './sceneComposer'

type Occlusion = ReturnType<GpuModule['gtao']['ao']>

/** One built chain, kept per shape of stack and per surface, as the Compatible one keeps its own. */
type GpuChain = {
  /**
   * The camera the pass and the occlusion were BUILT with. A node chain bakes it in where the
   * GL one rebinds it per draw, so a surface handed another camera — a film whose shot list
   * changes camera mid-way — needs the chain built again rather than reused.
   */
  camera: ComposerJob['camera']
  pipeline: { render: () => void; dispose: () => void }
  /** The scene pass, freed by hand: `RenderPipeline.dispose` frees its quad material and no target. */
  pass: { dispose: () => void }
  /** Written before every draw: the nodes read them, so a slider moves a number and nothing else. */
  apply: (effects: readonly PostEffect[], budget: GpuBudget, width: number, height: number) => void
}

export function createGpuComposer(gpu: GpuModule, renderer: WebGPURenderer): SceneComposer {
  const chains = new Map<string, GpuChain>()
  // Scratch, so a frame allocates nothing: `draw` runs once per surface, per image — the same
  // reason `PostComposer` keeps its own held rectangles as fields.
  const heldViewport = new Vector4()
  const heldScissor = new Vector4()

  /**
   * Points the renderer at where this job lands, and hands back the call that puts back what
   * was there. Held and restored around every draw, as `PostComposer.hold`/`restore` does: this
   * runs INSIDE the pane loop, which has already set a scissor for the pane after this one.
   */
  const aimAt = (job: ComposerJob): (() => void) => {
    renderer.getViewport(heldViewport)
    renderer.getScissor(heldScissor)
    const heldScissorTest = renderer.getScissorTest()
    const restoreTarget = drawInto(renderer, job.target)
    // 🛑 The OUTPUT target and not only the render target: a `PassNode` sizes its own buffers
    // from `getOutputRenderTarget()` when there is one and from the DRAWING BUFFER when there
    // is not. Left unsaid, a film at 1920×1080 would compose out of a G-buffer the size of the
    // canvas behind it — the GL chain is compiled at the job's own size for the same reason.
    renderer.setOutputRenderTarget(asNodeTarget(job.target))
    const restore = (): void => {
      renderer.setOutputRenderTarget(null)
      restoreTarget()
      renderer.setViewport(heldViewport)
      renderer.setScissor(heldScissor)
      renderer.setScissorTest(heldScissorTest)
    }
    if (!job.rect) return restore
    renderer.setViewport(job.rect.x, job.rect.y, job.rect.width, job.rect.height)
    renderer.setScissor(job.rect.x, job.rect.y, job.rect.width, job.rect.height)
    renderer.setScissorTest(true)
    return restore
  }
  /** Which surface draws through which chain, so a closed panel frees what only it was using. */
  const bound = new Map<string, string>()

  const free = (key: string): void => {
    const chain = chains.get(key)
    chain?.pipeline.dispose()
    // The MRT the scene pass draws into is a full-frame colour, normal and depth buffer, and
    // nothing in `RenderPipeline.dispose` reaches it — evicted chains would leak one each.
    chain?.pass.dispose()
    chains.delete(key)
  }

  return {
    draw: job => {
      const plan = planStack(job.stack)
      const effects = plan.effects.filter(runsOnGpu)
      if (effects.length === 0 || job.width < 1 || job.height < 1) {
        const restore = aimAt(job)
        try {
          renderer.render(job.scene, job.camera)
        } finally {
          restore()
        }
        return
      }

      // The SURFACE belongs to the key: a node chain holds the pass that draws the scene, and
      // two panes sharing one would each see the other's camera.
      const key = `${plan.shapeKey}${SURFACE_MARK}${job.surface}`
      const held = chains.get(key)
      if (held && held.camera !== job.camera) free(key)
      const chain = chains.get(key) ?? build(gpu, renderer, job, effects)
      chains.set(key, chain)
      bound.set(job.surface, key)
      chain.apply(effects, gpuBudgetFor(heaviestCost(effects), job.quality), job.width, job.height)

      const restore = aimAt(job)
      try {
        chain.pipeline.render()
      } finally {
        restore()
      }
    },

    sweep: live => {
      const shapes = new Set(live.map(stackShapeKey))
      for (const key of [...chains.keys()]) {
        if (!shapes.has(key.slice(0, key.indexOf(SURFACE_MARK)))) free(key)
      }
    },

    releaseSurface: surface => {
      const key = bound.get(surface)
      bound.delete(surface)
      // Only once nobody else draws through it: a chain is keyed on the surface, but a sweep
      // may have bound two of them to one shape.
      if (key && ![...bound.values()].includes(key)) free(key)
    },

    dispose: () => {
      for (const key of [...chains.keys()]) free(key)
      bound.clear()
    },
  }
}

/**
 * The chain: the scene drawn into a pass that writes its normals alongside the picture, then the
 * occlusion multiplied into it. The slot order the registry fixes, unchanged — `ao` reads the
 * depth and the normals of the render and darkens before anything spreads light around.
 */
function build(
  gpu: GpuModule,
  renderer: WebGPURenderer,
  job: ComposerJob,
  effects: readonly PostEffect[],
): GpuChain {
  const { mrt, normalView, output, pass } = gpu.tsl

  const scene = pass(job.scene, job.camera)
  // The normals written by the SAME pass that draws the picture: read from a second pass they
  // would cost the scene twice, which is the whole reason a node chain exists.
  scene.setMRT(mrt({ output, normal: normalView }))

  const occlusion = effects.some(one => one.effect === 'gtao')
    ? gpu.gtao.ao(scene.getTextureNode('depth'), scene.getTextureNode('normal'), job.camera)
    : null

  const colour = scene.getTextureNode('output')
  const pipeline = new gpu.webgpu.RenderPipeline(
    renderer,
    occlusion ? occlusion.getTextureNode().mul(colour) : colour,
  )

  return {
    camera: job.camera,
    pipeline,
    pass: scene,
    apply: (held, budget, width, height) => {
      const asked = held.find(one => one.effect === 'gtao')
      if (occlusion && asked) applyOcclusion(occlusion, asked, budget, width, height)
    },
  }
}

/** Everything the occlusion node reads off its fiche, through the budget the setting allows. */
function applyOcclusion(
  occlusion: Occlusion,
  effect: PostEffect,
  budget: GpuBudget,
  width: number,
  height: number,
): void {
  occlusion.radius.value = paramNumber(effect, 'radius')
  occlusion.distanceExponent.value = paramNumber(effect, 'distanceExponent')
  occlusion.thickness.value = paramNumber(effect, 'thickness')
  occlusion.scale.value = paramNumber(effect, 'scale')
  occlusion.samples.value = gpuSamplesOf(paramNumber(effect, 'samples'), budget)
  // Said to the NODE rather than to a target: a node chain carries its own scale, where the GL
  // chain is compiled at a size. The same reading either way — see `gpuPostQuality`.
  occlusion.resolutionScale = budget.resolutionScale
  occlusion.setSize(width, height)
}

/** What tells a shape from the surface it was built for, in a chain key. */
const SURFACE_MARK = '#'

/**
 * `as`: the studio allocates `WebGLRenderTarget`, which extends the `RenderTarget` a node
 * renderer takes — three declares the pair apart and both engines draw into the same object.
 */
function asNodeTarget(target: WebGLRenderTarget | null): RenderTarget | null {
  return target as unknown as RenderTarget | null
}

/** Whether the Advanced engine can build this one at all — the registry answers, nothing else. */
function runsOnGpu(effect: PostEffect): boolean {
  return POST_EFFECTS[effect.effect].engines.includes('gpu')
}

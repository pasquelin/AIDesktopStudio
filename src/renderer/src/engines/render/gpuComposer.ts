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
  runsOnEngine,
  stackShapeKey,
  survivesOneShot,
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
  /**
   * The nodes freed by hand: `RenderPipeline.dispose` frees its quad material and no target. The
   * scene pass owns the MRT the whole frame is drawn into, the occlusion its own half-resolution
   * buffer, and the temporal anti-aliaser a history and a resolve buffer.
   */
  owned: readonly { dispose: () => void }[]
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
    //
    // 🛑 Set for a PLAIN render too, and it is not tidiness: rendering into a target without it,
    // three writes the working colour space and the read-back comes out linear — measured
    // 2026-09-11, every pixel of a still differed. What remains with it set is a tonal
    // difference on 13.6 % of the pixels between this straight render and the one the viewport
    // makes when no composer is asked at all. Same picture, two tones; see the report.
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
    for (const node of chain?.owned ?? []) node.dispose()
    chains.delete(key)
  }

  /**
   * The chain this job draws through, built or found, and the one this surface was drawing
   * through before it freed.
   *
   * The SURFACE belongs to the key: a node chain holds the pass that draws the scene, and two
   * panes sharing one would each see the other's camera. The previous chain is freed HERE rather
   * than left for a sweep — a stack whose shape changes would otherwise leave a full-frame MRT
   * behind on every edit.
   */
  const chainFor = (job: ComposerJob, effects: readonly PostEffect[], shape: string): GpuChain => {
    const key = `${shape}${SURFACE_MARK}${job.surface}`
    const held = chains.get(key)
    if (held && held.camera !== job.camera) free(key)
    const chain = chains.get(key) ?? build(gpu, renderer, job, effects)
    chains.set(key, chain)

    const previous = bound.get(job.surface)
    bound.set(job.surface, key)
    if (previous && previous !== key && ![...bound.values()].includes(previous)) free(previous)
    return chain
  }

  return {
    draw: job => {
      const plan = planStack(job.stack)
      // A surface drawn ONCE loses whatever resolves against the frames before it: an export
      // builds a chain, draws a picture and frees it, and a temporal node handed an empty
      // history draws a flat colour. See `survivesOneShot`.
      //
      // Two module-level predicates rather than one closure over `job`: this runs once per
      // surface per IMAGE, and the viewport — the only surface that runs at 60 Hz — takes the
      // branch that allocates nothing.
      const effects = job.oneShot
        ? plan.effects.filter(drawableOnce)
        : plan.effects.filter(drawableOnGpu)
      if (effects.length === 0 || job.width < 1 || job.height < 1) {
        const restore = aimAt(job)
        try {
          renderer.render(job.scene, job.camera)
        } finally {
          restore()
        }
        return
      }

      const chain = chainFor(job, effects, plan.shapeKey)
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
  const { float, mix, uniform, vec3, vec4 } = gpu.tsl
  const wantsAntialias = effects.some(one => one.effect === 'traa')
  const scene = scenePass(gpu, job, wantsAntialias)

  const occlusion = effects.some(one => one.effect === 'gtao')
    ? gpu.gtao.ao(scene.getTextureNode('depth'), scene.getTextureNode('normal'), job.camera)
    : null

  const colour = scene.getTextureNode('output')
  /** How much of the occlusion lands, `GTAOPass.blendIntensity` on the other engine. */
  const blend = uniform(1)
  // 🛑 `.r` broadcast over three channels, and NEVER the texture node whole: `GTAONode` renders
  // its occlusion into a `RedFormat` target, so sampling it gives `(ao, 0, 0, 1)` — multiplied
  // into the picture as it stands, that leaves a RED image. three's own fiche spells it this way.
  // Caught by `engines:parity` and by nothing else: the bench measured what this chain COSTS.
  const lit = occlusion
    ? colour.mul(vec4(vec3(mix(float(1), occlusion.getTextureNode().r, blend)), 1))
    : colour
  // Last, and the registry already says so: `aa` is the final slot, and an anti-aliaser reads
  // finished pixels — the occlusion has to have darkened them before their edges are resolved.
  const antialias = wantsAntialias
    ? gpu.traa.traa(
        lit,
        scene.getTextureNode('depth'),
        scene.getTextureNode('velocity'),
        job.camera,
      )
    : null

  const pipeline = new gpu.webgpu.RenderPipeline(renderer, antialias ?? lit)

  return {
    camera: job.camera,
    pipeline,
    // 🛑 The occlusion too: `GTAONode` owns a full-frame `RedFormat` target and a material, and
    // `RenderPipeline.dispose` reaches neither — every evicted chain leaked one.
    owned: [scene, ...(occlusion ? [occlusion] : []), ...(antialias ? [antialias] : [])],
    apply: (held, budget, width, height) => {
      const asked = held.find(one => one.effect === 'gtao')
      if (occlusion && asked) {
        blend.value = paramNumber(asked, 'blend')
        applyOcclusion(occlusion, asked, budget, width, height)
      }
      // The one lever a `TRAANode` offers: its samples are FRAMES, of a fixed sequence, and no
      // number of them is exposed — so it is kept where nothing is being cut. See `gpuPostQuality`.
      if (antialias) antialias.useSubpixelCorrection = budget.samples === 1
    },
  }
}

/**
 * The pass that draws the scene, and what it writes alongside the picture.
 *
 * The normals come from the SAME pass: read from a second one they would cost the scene twice,
 * which is the whole reason a node chain exists. The velocity joins them only where something
 * reprojects — it is a full-frame buffer nobody else reads.
 *
 * 🛑 `samples: 0` where the temporal anti-aliaser runs, and it is three.js that says so: a
 * `PassNode` takes the RENDERER's multisampling unless told otherwise, and TRAA resolves its own
 * edges from the previous frames — the two together resolve twice and smear.
 */
function scenePass(gpu: GpuModule, job: ComposerJob, wantsAntialias: boolean) {
  const { mrt, normalView, output, pass, velocity } = gpu.tsl
  const scene = pass(job.scene, job.camera, wantsAntialias ? { samples: 0 } : undefined)
  scene.setMRT(mrt({ output, normal: normalView, ...(wantsAntialias ? { velocity } : {}) }))
  return scene
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
function drawableOnGpu(effect: PostEffect): boolean {
  return runsOnEngine(effect.effect, 'gpu')
}

/** The same, for a picture drawn once: a temporal node has no history there. */
function drawableOnce(effect: PostEffect): boolean {
  return drawableOnGpu(effect) && survivesOneShot(effect.effect)
}

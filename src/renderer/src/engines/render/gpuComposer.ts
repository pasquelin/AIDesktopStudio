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
import { Vector4 } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import {
  planStack,
  runsOnEngine,
  stackShapeKey,
  survivesOneShot,
  type PostEffect,
} from '@shared/domain/postProcessing'
import { paramNumber } from '../postfx/uniforms'
import { samplesOf } from '../postfx/postQuality'
import { heaviestCost } from '../postfx/postPlan'
import { gpuBudgetFor, type GpuBudget } from './gpuPostQuality'
import type { GpuModule } from './gpuModule'
import { asNodeTarget, drawInto } from './renderDriver'
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

/** A built chain and the shape of stack it was built for. Kept per SURFACE — see `chainFor`. */
type HeldChain = { shape: string; chain: GpuChain }

export function createGpuComposer(gpu: GpuModule, renderer: WebGPURenderer): SceneComposer {
  const chains = new Map<string, HeldChain>()
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

  const free = (surface: string): void => {
    const held = chains.get(surface)
    if (!held) return
    held.chain.pipeline.dispose()
    // The MRT the scene pass draws into is a full-frame colour, normal and depth buffer, and
    // nothing in `RenderPipeline.dispose` reaches it — evicted chains would leak one each.
    for (const node of held.chain.owned) node.dispose()
    chains.delete(surface)
  }

  /**
   * The chain this job draws through, built or found.
   *
   * ONE per surface: a node chain holds the pass that draws the scene, and two panes sharing one
   * would each see the other's camera. A surface whose stack changed shape — or that is handed
   * another camera — frees what it held HERE rather than leaving it for a sweep, which would
   * otherwise leave a full-frame MRT behind on every edit.
   */
  const chainFor = (job: ComposerJob, effects: readonly PostEffect[], shape: string): GpuChain => {
    const held = chains.get(job.surface)
    if (held && (held.shape !== shape || held.chain.camera !== job.camera)) free(job.surface)
    const chain = chains.get(job.surface)?.chain ?? build(gpu, renderer, job, effects)
    chains.set(job.surface, { shape, chain })
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
      for (const [surface, held] of [...chains]) if (!shapes.has(held.shape)) free(surface)
    },

    releaseSurface: free,

    dispose: () => {
      for (const surface of [...chains.keys()]) free(surface)
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
  occlusion.samples.value = samplesOf(paramNumber(effect, 'samples'), budget)
  // Said to the NODE rather than to a target: a node chain carries its own scale, where the GL
  // chain is compiled at a size. The same reading either way — see `gpuPostQuality`.
  occlusion.resolutionScale = budget.resolutionScale
  occlusion.setSize(width, height)
}

/** Whether the Advanced engine can build this one at all — the registry answers, nothing else. */
function drawableOnGpu(effect: PostEffect): boolean {
  return runsOnEngine(effect.effect, 'gpu')
}

/** The same, for a picture drawn once: a temporal node has no history there. */
function drawableOnce(effect: PostEffect): boolean {
  return drawableOnGpu(effect) && survivesOneShot(effect.effect)
}

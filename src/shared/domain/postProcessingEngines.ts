/**
 * What each ENGINE can build of the catalogue, and what a surface drawn once has to leave out.
 *
 * Apart from the catalogue itself, which is a table of fiches: these are the three questions the
 * two chains and the effect library all ask of it, and asking them by hand is how one caller
 * ends up offering what another cannot draw.
 */
import { POST_EFFECTS, POST_EFFECT_IDS, type PostEffectId } from './postProcessingRegistry'
import type { RenderEngine } from './renderEngine'

/**
 * The ids the Compatible engine cannot build, spelled as a TYPE and not only read off `engines`.
 *
 * `engines` is data, and the tables that implement an effect are `Record`s keyed on the union —
 * which is what makes a new effect fail to compile until somebody writes its pass. A GPU-only one
 * has no GL pass to write, so it is excluded from that door here; `postFactories.test.ts` holds
 * the two readings to the same answer.
 */
export type GpuOnlyEffectId = 'traa'

/** Whether an engine can build that effect at all. The registry answers, and nothing else does. */
export function runsOnEngine(effect: PostEffectId, engine: RenderEngine): boolean {
  return POST_EFFECTS[effect].engines.includes(engine)
}

/**
 * Whether an effect can be built for a surface drawn ONCE — a still, an export, a thumbnail.
 *
 * A temporal one cannot: it resolves the picture against the frames before it, and a chain built,
 * drawn and freed has none. Left in, it draws a flat colour; left out, the picture is simply not
 * anti-aliased that way, which is what an export of it has always been.
 */
export function survivesOneShot(effect: PostEffectId): boolean {
  return POST_EFFECTS[effect].temporal !== true
}

/**
 * The catalogue an engine can actually build, in the order the registry declares them.
 *
 * What a LIBRARY offers, and what a chain keeps out of itself: offering an effect the chain will
 * silently leave out is offering nothing, and a chain that tried to build one would throw where
 * a document is simply carrying more than this engine knows.
 *
 * Worked out ONCE: the catalogue is frozen at load and there are two engines, so an answer built
 * per call would be a fresh array nobody could use as a memo dependency.
 */
export function effectsForEngine(engine: RenderEngine): readonly PostEffectId[] {
  return BY_ENGINE[engine]
}

const BY_ENGINE: Record<RenderEngine, readonly PostEffectId[]> = {
  gl: POST_EFFECT_IDS.filter(id => runsOnEngine(id, 'gl')),
  gpu: POST_EFFECT_IDS.filter(id => runsOnEngine(id, 'gpu')),
}

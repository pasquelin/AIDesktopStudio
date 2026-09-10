/**
 * Which engine draws — the studio's two words for WebGL and WebGPU.
 *
 * A module of its own, and small on purpose: a render policy names one, and so does every
 * post-processing effect. Declared inside either of them, the other would have to import it and
 * `renderPolicy → scene → postProcessing → postProcessingRegistry` would close into a cycle.
 */
export type RenderEngine = 'gl' | 'gpu'

export const RENDER_ENGINES: readonly RenderEngine[] = ['gl', 'gpu']

/** What every effect written before the Advanced engine existed runs on, and only that. */
export const GL_ONLY: readonly RenderEngine[] = ['gl']

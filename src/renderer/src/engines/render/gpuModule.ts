/**
 * The Advanced engine's own three.js, loaded only when a machine can run it.
 *
 * 🛑 A SEPARATE bundle, and a large one: `three/webgpu` re-exports the whole library with the
 * node system on top. Imported at the head of any module the editor always loads, every session
 * would pay for it — so it is asked for beside the adapter, and the answer is remembered.
 *
 * The three are asked for together because they arrive together: a viewport that has the renderer
 * but not the occlusion node would build a chain it cannot finish.
 */
import type * as WebGpuModule from 'three/webgpu'
import type * as TslModule from 'three/tsl'
import type * as GtaoModule from 'three/addons/tsl/display/GTAONode.js'
import { askedGpuAdapter, probeGpuAdapter } from './gpuAdapter'

export type GpuModule = {
  webgpu: typeof WebGpuModule
  tsl: typeof TslModule
  gtao: typeof GtaoModule
}

let held: GpuModule | null = null
let loading: Promise<GpuModule | null> | null = null

/** What was loaded, or `null` while nobody has finished asking. Never waits — a mount cannot. */
export function loadedGpuModule(): GpuModule | null {
  return held
}

/**
 * Asks for the adapter and the bundle together, once. Answers `null` on a machine with no
 * adapter: loading two megabytes of renderer for a driver that will never draw is the cost this
 * exists to avoid.
 */
export async function loadGpuModule(): Promise<GpuModule | null> {
  if (held) return held
  // A machine already known to have no adapter is not asked twice, and its two megabytes of
  // renderer are never fetched at all.
  if (askedGpuAdapter() === false) return null
  loading ??= importGpuModule()
  return await loading
}

async function importGpuModule(): Promise<GpuModule | null> {
  if (!(await probeGpuAdapter())) return null

  const [webgpu, tsl, gtao] = await Promise.all([
    import('three/webgpu'),
    import('three/tsl'),
    import('three/addons/tsl/display/GTAONode.js'),
  ])
  held = { webgpu, tsl, gtao }
  return held
}

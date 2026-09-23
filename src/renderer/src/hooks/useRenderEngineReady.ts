import { useEffect, useState } from 'react'
import type { RenderEngine } from '@shared/domain/renderEngine'
import { loadedGpuModule, loadGpuModule } from '@/engines/render/gpuModule'

/**
 * Whether a viewport may be BUILT on this engine yet.
 *
 * 🛑 The Advanced engine is only chosen once its bundle is in, and that bundle is an import of
 * its own — `three/webgpu` re-exports the whole library, fetched the first time anything asks. A
 * viewport that mounted before it landed was handed the Compatible one and never asked again:
 * measured 2026-09-11, a scene saved under Advanced drew WebGL for the whole session that opened
 * it, and wrote a fallback to the journal that was not one.
 *
 * `true` at once for the Compatible engine, and for the Advanced one as soon as the load SETTLES
 * — including on « this machine has no adapter », which is a fallback and not a wait. So nothing
 * can hang here: the answer always arrives.
 */
export function useRenderEngineReady(engine: RenderEngine): boolean {
  const [settled, setSettled] = useState(() => loadedGpuModule() !== null)

  useEffect(() => {
    if (settled || engine !== 'gpu') return

    let live = true
    const ask = async (): Promise<void> => {
      await loadGpuModule()
      if (live) setSettled(true)
    }
    void ask()
    return () => {
      live = false
    }
  }, [engine, settled])

  // Derived rather than latched: a tab reads `gl` until its file lands, and a `ready` left true
  // from that phase would mount the Advanced engine on a bundle nobody had asked for.
  return engine === 'gl' || settled
}

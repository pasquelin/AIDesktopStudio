import { sceneEngineOf } from '@/stores/sceneEngines'
import { clearGameOptimizationCache } from './gameChannel'

/**
 * Drops every compiled representation held for one authoring scene: the analyzer's own cache in
 * this window, and the runtime world the game window holds.
 *
 * 🛑 Reached only by `optimization.clearCache` today, so a scene edited in the studio leaves the
 * game window on a stale representation. The single point belongs where a scene CHANGES — the
 * command runner of `useScenes` — which is not this module's to wire.
 */
export function dropCompiledScene(documentId: string): void {
  sceneEngineOf(documentId)?.clearOptimizationCache()
  clearGameOptimizationCache(documentId)
}

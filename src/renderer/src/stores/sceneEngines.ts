import type { SceneRenderer } from '@/engines/scene/SceneRenderer'

/**
 * The live engine of each open scene, so a panel that is not the viewport can ask it for
 * something only it can do — today, drawing a film off screen.
 *
 * A plain map rather than a store: nothing renders from it, and a live WebGL engine put into
 * zustand would make every subscriber re-render whenever a document opened. It is registered by
 * the viewport that owns it and forgotten when that viewport goes, so an engine outliving its
 * canvas can never be handed out.
 */
const engines = new Map<string, SceneRenderer>()

export function registerSceneEngine(documentId: string, engine: SceneRenderer): void {
  engines.set(documentId, engine)
}

export function forgetSceneEngine(documentId: string): void {
  engines.delete(documentId)
}

/** The engine of that document, or nothing — a tab whose viewport is not mounted has none. */
export function sceneEngineOf(documentId: string): SceneRenderer | undefined {
  return engines.get(documentId)
}

/** Tells every mounted scene that a shared model asset lost its embedded textures. */
export function detachModelFileTexturesInScenes(assetId: string): void {
  for (const engine of engines.values()) engine.detachModelFileTextures(assetId)
}

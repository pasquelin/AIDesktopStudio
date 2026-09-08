import { createKeptStore } from '@game/host/keptStore'
import type { ScenePort } from '@game/ports/scenePort'

/** A load a running game asked for, waiting for the gap between two steps. */
type SceneRequest = { scene: string; fade: number }

export type SceneSwap = {
  port: ScenePort
  /** What was asked for, without taking it: a scene still being read is asked for again. */
  pending: () => SceneRequest | null
  /** Done with it, whichever way it went. Until then a second ask cannot overwrite the first. */
  settled: () => void
}

/** 🛑 The studio's `ScenePort`: the store must outlive the world that wrote it. */
export function createSceneSwap(): SceneSwap {
  const store = createKeptStore()
  // 🛑 The FIRST of a step wins: two scripts each asking for a different scene would otherwise
  // load one and then the other, and nobody would ever see the first.
  let asked: SceneRequest | null = null

  return {
    port: {
      load: (scene, fade) => {
        if (asked === null) asked = { scene, fade: Number.isFinite(fade) ? Math.max(fade, 0) : 0 }
      },
      keep: store.keep,
      kept: store.kept,
    },

    pending: () => asked,

    settled: () => {
      asked = null
    },
  }
}

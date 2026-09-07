import type { AnimationPort, PosedClip } from '@game/ports/animationPort'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'

/** What a running game asks of the viewport's mixers. Narrowed as `SceneDraw` is, and for the
 * same reason: a test drives this without a WebGL context. */
export type SceneAnimate = Pick<
  SceneRenderer,
  'poseNode' | 'releaseNode' | 'clipLengthsOf' | 'useGraphClips' | 'seekClips'
>

/**
 * 🛑 Writes through the ONE mixer the viewport already holds for that model, so a body posed this
 * way leaves the band for as long as it is — see `SceneAnimations.pose`.
 */
export function createStudioAnimation(renderer?: SceneAnimate): AnimationPort {
  const posed = new Set<string>()
  const give = (entity: string): void => {
    posed.delete(entity)
    renderer?.releaseNode(entity)
  }

  return {
    pose: (entity: string, clips: readonly PosedClip[]) => {
      if (!renderer) return
      posed.add(entity)
      renderer.poseNode(entity, clips)
    },
    release: give,
    // 🛑 What STOP calls: it throws the engines away without disposing the world, so nothing
    // would run the animator's own `dispose` and the body would keep its last playing pose.
    releaseAll: () => {
      for (const entity of [...posed]) give(entity)
    },
    // 🛑 No mixer means no length, which the machine reads as « the clip has not landed »:
    // the state holds and poses nothing, rather than the game refusing to run.
    lengths: (entity: string) => renderer?.clipLengthsOf(entity) ?? {},
  }
}

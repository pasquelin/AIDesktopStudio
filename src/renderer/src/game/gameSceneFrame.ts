import type { Box3, Camera, Light } from 'three'
import type { Us } from '@shared/domain/time'
import type { PosedClip } from '@game/ports/animationPort'
import type { InstancedGroups, ShadowThrow } from '@/engines/scene/grouping'
import { oweShadowMap, oweShadowPass } from '@/engines/scene/shadows'
import type { SceneResources } from './gameSceneResources'
import type { WorldDrape } from './gameSceneWorld'
import { growShadowBounds, isLight } from './gameSceneShadows'

/** What one flush of a game scene changed — enough for the draw to know which passes it owes. */
export type GameFlush = {
  /** Instanced cells appeared or left: a picture, and every map — a cell of node shapes casts. */
  zoned: boolean
  /** A caster, a light or a group carrying one moved from what the frustums were cut to. */
  reframed: boolean
  /** The maps this flush marked have to be drawn — scenery moved, a clip posed, a light turned. */
  shadowed: boolean
  /** A scatter cell toggled, or a picture landed on a material: a picture to draw, and no map. */
  changed: boolean
}

/** The editor's own skip: a still picture keeps the canvas it already shows. */
export const frameOwesDraw = (settled: GameFlush, pictureStale: boolean): boolean =>
  pictureStale || frameOwesShadows(settled) || settled.changed

/** Whether the renderer runs a depth pass at all; which maps it draws was marked per light. */
export const frameOwesShadows = (settled: GameFlush): boolean =>
  settled.zoned || settled.reframed || settled.shadowed

export type FrameSettler = {
  /** See `GameScene.flush`. */
  flush: (camera: Camera, cast: ShadowThrow | null) => GameFlush
  /** See `GameScene.seek`. */
  seek: (time: Us) => boolean
  pose: (nodeId: string, clips: readonly PosedClip[]) => void
  releasePose: (nodeId: string) => void
}

type FrameParts = {
  drape: WorldDrape
  instances: InstancedGroups
  resources: SceneResources
  lights: readonly Light[]
  shadowBounds: Box3
}

/**
 * Settles what `place`, `seek` and the poses left between two frames — instanced bounds, scatter,
 * the spatial cells the editor follows from `dressPane`, the shadow box — and says what the frame
 * owes. A light that moved alone owes its own map and a fresh frustum; scenery that moved, a clip
 * that posed, or a cell that came into view owe every map — the editor's rule, `syncChangedNodes`.
 */
export function createFrameSettler({
  drape,
  instances,
  resources,
  lights,
  shadowBounds,
}: FrameParts): FrameSettler {
  const { staleInstances, movedObjects, animations } = resources
  // The first frame owes everything: the maps are unsized until the caller fits them.
  let first = true
  let posed = false

  const settleInstances = (): void => {
    // 🛑 Once a frame, never per instance: `computeBoundingSphere` walks every slot of the mesh,
    // so recomputing it inside the placement made a 1 000-instance node quadratic per frame.
    for (const mesh of staleInstances) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }

  // A light has no reach of its own, so the bounds are grown by everything that moved without
  // sorting it — a group included, which asks for a fit on behalf of any light it carries.
  const settleShadows = (zoned: boolean): Pick<GameFlush, 'reframed' | 'shadowed'> => {
    let sceneryMoved = posed || staleInstances.size > 0
    let lightMoved = false
    for (const object of movedObjects) {
      if (isLight(object)) {
        oweShadowMap(object)
        lightMoved = true
      } else sceneryMoved = true
    }
    if (first || sceneryMoved || zoned) oweShadowPass(lights)
    const grown = sceneryMoved && growShadowBounds(shadowBounds, movedObjects, staleInstances)
    return { reframed: first || grown || lightMoved, shadowed: sceneryMoved }
  }

  return {
    flush: (camera, cast) => {
      // Both settled, never short-circuited: the cells are followed whether or not a scatter moved.
      const scattered = drape.updateVisibility(camera)
      const zoned = instances.follow?.(camera, cast) ?? false
      // A scatter cell casts nothing, and toggles at SCATTER_DISTANCE: a picture, never a map.
      const changed = scattered || resources.textureArrived
      resources.textureArrived = false
      settleInstances()
      const { reframed, shadowed } = settleShadows(zoned)
      first = false
      posed = false
      movedObjects.clear()
      staleInstances.clear()
      return { zoned, reframed, shadowed, changed }
    },
    seek: time => {
      const moved = animations.seek(time)
      posed ||= moved
      return moved
    },
    pose: (nodeId, clips) => {
      animations.pose(nodeId, clips)
      posed = true
    },
    releasePose: nodeId => {
      animations.release(nodeId)
      posed = true
    },
  }
}

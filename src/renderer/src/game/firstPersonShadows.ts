import type { Object3D } from 'three'
import type { SceneState } from '@/engines/scene/sceneState'
import { playerPartsOf } from '@/engines/scene/playerModule'
import { FirstPersonBody } from '@/engines/scene/FirstPersonBody'

export function firstPersonShadows(
  state: SceneState,
  byEntity: ReadonlyMap<string, Object3D>,
): () => void {
  const mask = new FirstPersonBody()
  const body = state.world.play.camera === 'firstPerson' ? playerPartsOf(state.nodes)?.body : null
  mask.sync(body ? byEntity.get(body.id) : undefined)
  return () => mask.dispose()
}

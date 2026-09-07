import { Mesh, type Material, type Object3D } from 'three'
import type { SceneState } from '@/engines/scene/sceneState'
import { playerPartsOf } from '@/engines/scene/playerModule'

/** Keep the player's shadow while the eye is inside its head, without changing shared materials. */
export function firstPersonShadows(
  state: SceneState,
  byEntity: ReadonlyMap<string, Object3D>,
): () => void {
  const originals = new Map<Mesh, Material | Material[]>()
  const copies = new Map<Material, Material>()
  const shadowOnly = (material: Material): Material => {
    const kept = copies.get(material)
    if (kept) return kept
    const copy = material.clone()
    copy.colorWrite = false
    copy.depthWrite = false
    copies.set(material, copy)
    return copy
  }
  const body = state.world.play.camera === 'firstPerson' ? playerPartsOf(state.nodes)?.body : null
  if (body)
    byEntity.get(body.id)?.traverse(object => {
      if (!(object instanceof Mesh)) return
      originals.set(object, object.material)
      object.material = Array.isArray(object.material)
        ? object.material.map(shadowOnly)
        : shadowOnly(object.material)
    })
  return () => {
    for (const [mesh, original] of originals) mesh.material = original
    for (const copy of copies.values()) copy.dispose()
  }
}

import {
  DirectionalLight,
  type Light,
  Mesh,
  Object3D,
  SpotLight,
  Sprite,
  Vector3 as ThreeVector3,
} from 'three'
import { type LightDescriptor } from '@shared/domain/scene'
import { type SceneNode } from './sceneState'
import { lightBody } from './lightBodies'
import { disposeTree } from './modelCache'
import { applyTransform, centreOf } from './pivot'
import { applyWireOverlay } from './sceneView'
import { characterExtrasIn } from './rigRead'
import './bvhPatches'
import { unhang } from './grouping'
import { disposeMaterial } from './sceneRendererSupport2'
import { SceneRendererShadows } from './SceneRendererShadows'
import type { CharacterSocket } from '@shared/domain/character'
export abstract class SceneRendererHierarchy extends SceneRendererShadows {
  private readonly socketHangers = new WeakMap<CharacterSocket, Object3D>()

  /** The body a lamp is drawn as, built from its descriptor and put in place of the last one. */
  protected dressLight(id: string, light: Light, descriptor: LightDescriptor): void {
    const worn = this.markers.get(id)
    // Hung before the old one goes: freeing the last user of a material destroys its GL program,
    // and three would compile it again on the very next frame.
    const body = lightBody(descriptor, this.markerColor, this.markerEdge)
    light.add(body)
    this.markers.set(id, body)
    if (worn) {
      light.remove(worn)
      disposeTree(worn)
    }
  }
  /** The object a node hangs from, or the scene for a node that hangs from nothing. */
  protected parentObjectOf(id: string): Object3D {
    const applied = this.applied.get(id)
    return (applied && this.hangerOf(applied)) ?? this.viewport.scene
  }
  /**
   * What this node hangs FROM: its parent, or the bone of the socket it is attached to.
   *
   * The socket is read off the parent's own file rather than from the document: sockets live in
   * the `.glb`, and the studio window learns them from the very object that landed.
   */
  protected hangerOf(node: SceneNode): Object3D | null {
    const parent = node.parentId ? this.objects.get(node.parentId) : this.viewport.scene
    if (!parent || !node.attach) return parent ?? null
    const socket = characterExtrasIn(parent)?.sockets?.find(one => one.id === node.attach?.socket)
    const bone = socket && parent.getObjectByName(socket.bone)
    if (!socket || !bone) return parent

    let hanger = this.socketHangers.get(socket)
    if (!hanger) {
      hanger = new Object3D()
      this.socketHangers.set(socket, hanger)
    }
    applyTransform(hanger, socket.rest)
    if (hanger.parent !== bone) bone.add(hanger)
    return hanger
  }
  /**
   * Puts an object under the one that stands for its parent, or back under the scene.
   *
   * `add` rather than `attach`: the document holds a *local* transform, which `syncNode` has
   * just written — so the object takes its new parent's frame, exactly as the document says.
   * Preserving the world transform instead would need the local one recomputed in the command,
   * which is the only place it could be written down.
   *
   * Skipped mid-drag, where the pivot is the parent that matters.
   */
  protected hangFromParent(node: SceneNode): void {
    const object = this.objects.get(node.id)
    if (!object || object.parent === this.pivot) return
    const parent = this.hangerOf(node)
    // A parent that is not built is not a reason to drop the child: the scene keeps it, and the
    // next sync — where the parent exists — hangs it where it belongs.
    if (!parent || object.parent === parent) return
    parent.add(object)
  }
  protected release(id: string): void {
    this.markContentChanged()
    this.placementChanged = true
    // Read before `applied` is emptied: the reference the cache holds is keyed by what the node
    // pointed at, and nothing else remembers it.
    const applied = this.applied.get(id)
    const key = this.modelKeys.get(id)
    if (applied?.type === 'model' && key !== undefined) this.modelCache.release(key)
    this.modelKeys.delete(id)
    // Given back once: `recut` may still be in flight, and `cutting` is what says which of the
    // two owes the reference.
    // `has`, never `delete`: consuming the token here left `recut` believing the reference had
    // already been given back, and neither side ever returned it.
    if (applied?.type === 'carved' && !this.cutting.has(id)) this.csg.release(applied.carved)
    // Before the instance goes: a mixer holding actions keeps every bone of a released model
    // alive with it.
    this.animations.remove(id)
    // Its share of every animation file it played: the last node to let go frees the parse.
    for (const url of this.bundled.get(id)?.values() ?? []) this.clipSources.release(url)
    this.cancelRetargets(id)
    this.bundled.delete(id)
    this.graphClips.delete(id)
    this.unbindSkeleton(id)
    this.iks.delete(id)
    this.stopSkinning(id)
    this.applied.delete(id)
    // Before the material goes: the slots have to give their references back, or the cache
    // keeps a 4K map alive for a node that no longer exists.
    for (const maps of [this.textures, this.spriteMaps, this.modelMaps]) {
      maps.get(id)?.dispose()
      maps.delete(id)
    }
    this.releaseObject(id)
    this.releaseAids(id)
  }

  /** The three.js object a node stood for, and everything only it holds. */
  private releaseObject(id: string): void {
    const object = this.objects.get(id)
    if (!object) return
    // Its own buffer, and a child of the mesh rather than the mesh: nothing else frees it.
    applyWireOverlay(object, false, this.wireMaterial)
    // Not `scene.remove`: mid-drag the object hangs off the pivot, and the scene would not
    // find it to remove. And `unhang` rather than `removeFromParent`: see there.
    unhang(object)
    if (object instanceof Mesh) {
      this.freeGeometry(object.geometry)
      disposeMaterial(object)
    }
    // A sprite is not a mesh, so the branch above never freed its material. Its geometry is
    // left alone on purpose: three.js shares one quad between every sprite ever built.
    if (object instanceof Sprite) object.material.dispose()
    if (object instanceof DirectionalLight || object instanceof SpotLight)
      this.viewport.scene.remove(object.target)
    this.objects.delete(id)
    this.rigRests.delete(id)
  }

  /**
   * The workshop furniture a node was drawn WITH, which hangs beside it rather than under it —
   * see `buildCamera`. Left alone, a helper leaks a line geometry and a frustum stays drawn over
   * nothing; a marker's whole shape leaks on an ambient lamp, which draws no helper at all.
   */
  private releaseAids(id: string): void {
    const helper = this.helpers.get(id)
    if (helper) {
      this.viewport.scene.remove(helper)
      helper.dispose()
      this.helpers.delete(id)
    }
    const frustum = this.frustums.get(id)
    if (frustum) {
      this.viewport.scene.remove(frustum)
      frustum.dispose()
      this.frustums.delete(id)
    }
    const marker = this.markers.get(id)
    if (marker) disposeTree(marker)
    this.markers.delete(id)
  }
  protected selectedObjects(): Object3D[] {
    return this.selectedIds.flatMap(id => this.objects.get(id) ?? [])
  }
  /**
   * Where the view turns when it turns around the selection — the SAME centre `placePivot` puts
   * the gizmo on, computed by the same function, so the two can never name different points.
   *
   * Recomputed rather than read off `this.pivot`: that one is only placed while a gizmo exists,
   * and a mode without one still has a selection — the reading `frameSelection` already makes.
   */
  protected selectionCentre(): ThreeVector3 | null {
    const objects = this.selectedObjects()
    return objects.length > 0 ? centreOf(objects, new ThreeVector3()) : null
  }
}

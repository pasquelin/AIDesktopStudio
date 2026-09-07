import {
  type Box3,
  type Light,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Sprite,
  SpriteMaterial,
} from 'three'
import { type LightDescriptor } from '@shared/domain/scene'
import { shadowMapSizeFor } from './viewportQuality'
import { type SceneNode, type SpriteNode } from './sceneState'
import { boundsOf } from './objectBounds'
import { isFramed } from './framedNodes'
import { railOf } from './nodeRail'
import { dressWithRail, type RailColours, helperFor } from './threeFactory'
import { aimLightMarker, holdMarkerSize } from './markerPose'
import { applyMaterial, applyNegative, applySprite, lightFor, standTarget } from './threeSync'
import { createMaterialTextures, createSpriteTexture } from './materialTextures'
import { reportFailure } from '@/services/diagnostics'
import { limitShadowUpdates, throwsOf, tuneShadowMaps } from './shadows'
import { applyWireOverlay } from './sceneView'
import './bvhPatches'
import { isNegative } from '../csg/carve'
import { SceneRendererModels } from './SceneRendererModels'

export abstract class SceneRendererShadows extends SceneRendererModels {
  protected abstract railColours(): RailColours

  protected abstract dressLight(id: string, light: Light, descriptor: LightDescriptor): void

  /**
   * The same, awaited by nobody. Under a scope of its OWN: `reportFailure` says a subject once
   * per scope, so sharing `scene.model` would let a failed tree swallow a later load's message.
   */
  protected async accelerateOrReport(object: Object3D, subject: string): Promise<void> {
    try {
      await this.accelerate(object)
    } catch (error) {
      reportFailure('scene.bvh', subject, error)
    }
  }

  /** Every mesh a model brought, given the tree that makes picking it cheap. */
  protected async accelerate(object: Object3D): Promise<void> {
    const meshes: Mesh[] = []
    object.traverse(child => {
      if (child instanceof Mesh) meshes.push(child)
    })

    // Every mesh is asked before any failure is raised. Letting the first one out of the loop
    // would cost the meshes behind it the tree the builder is ready to build them — it recovers
    // from a dead worker, and nothing ever walks a loaded model a second time to ask again.
    const failures: unknown[] = []
    for (const mesh of meshes) {
      try {
        await this.bvh.accelerate(mesh)
      } catch (error) {
        failures.push(error)
      }
    }

    this.redraw()
    if (failures.length > 0) throw failures[0]
  }

  protected applyDisplay(object: Object3D): void {
    // The mode itself lands per pane, at render time; what an arriving object needs here is its
    // edges, which are geometry rather than a flag.
    applyWireOverlay(object, this.needsEdges(), this.wireMaterial, this.quadEdges)
  }

  /**
   * Hands the viewport back the frame it asked for, with the unchanged lights left out of the
   * depth pass. Cleared HERE and not on the request: several requests may fall on one frame.
   */
  protected limitShadowFrame(refreshAll: boolean): () => void {
    const restore = limitShadowUpdates(this.objects.values(), refreshAll, this.changedShadowLights)
    this.changedShadowLights.clear()
    return restore
  }

  /**
   * The reach only has to be read again when something MOVED. A selection moves nothing, and
   * `apply` runs on every state change. The settings call `tuneShadows` directly instead: a map
   * that was resized has to be rebuilt whether or not the set stands where it stood.
   */
  protected tuneShadowsIfMoved(): void {
    if (!this.placementChanged) return
    this.tuneShadows()
    this.placementChanged = false
  }

  /** Every light at once, against a reach measured once — the pass an exported game runs too. */
  protected tuneShadows(): void {
    const lights: Object3D[] = []
    for (const [id, object] of this.objects) {
      if (this.applied.get(id)?.type === 'light') lights.push(object)
    }
    // Measured once for its two readers, and only if a light would read it at all.
    let bounds: Box3 | null = null
    const boundsOnce = (): Box3 => (bounds ??= this.heldShadowBounds())
    const tuned = tuneShadowMaps(
      lights,
      shadowMapSizeFor(this.view.quality, this.view.shadowMapSize),
      () => ({ bounds: boundsOnce(), floor: this.view.gridSize }),
    )
    this.shadowThrow = tuned && throwsOf(tuned.framed, boundsOnce(), tuned.reach)
  }

  /**
   * 🛑 Walked in FULL only when the content changed. Reading the box off every object on every
   * pass was 23.8 ms of the 38.7 one `apply` cost on 50 000 lit nodes — a whole frame budget
   * spent re-measuring a set that had moved by one node.
   *
   * A move grows the box and never shrinks it: a frustum too WIDE loses a little shadow
   * resolution, one too NARROW clips the shadow off. Bringing an object back from far away
   * therefore keeps the wider frustum until the next content change.
   */
  protected heldShadowBounds(): Box3 {
    if (!this.shadowBounds) {
      this.shadowBounds = boundsOf(this.framedObjects())
      return this.shadowBounds
    }
    // What hangs under them too: a body a group draws for is out of its parent's children, and a
    // box that missed it would be a frustum too NARROW — the direction that clips a shadow off.
    for (const id of this.descendantsOf(this.movedNodes)) {
      const object = this.objects.get(id)
      if (object && isFramed(this.applied.get(id)?.type ?? 'group')) {
        this.shadowBounds.expandByObject(object)
      }
    }
    return this.shadowBounds
  }

  protected buildMesh(node: SceneNode & { type: 'mesh' }): Mesh {
    const material = new MeshStandardMaterial()
    applyMaterial(material, node.material, this.meshColor)
    applyNegative(material, this.negativeColor, isNegative(node))

    const mesh = new Mesh(this.shapes.acquire(node.geometry, node.material.tilesPerMetre), material)
    // A texture arrives long after the frame that asked for it: the render is requested again
    // when it lands, or the viewport would show the mesh untextured until something else moved.
    const textures = createMaterialTextures(this.textureCache, mesh, material, slot =>
      this.refreshMaterialTexture(slot),
    )
    textures.apply(node.material)
    this.textures.set(node.id, textures)

    // A band wears the very handles a rail does — see `railOf`. Hung on the mesh itself, so they
    // travel with it and a pick reads their index out of the same names.
    const rail = railOf(node)
    if (rail) dressWithRail(mesh, rail, this.railColours(), true)

    return mesh
  }

  protected buildSprite(node: SpriteNode): Sprite {
    const material = new SpriteMaterial()
    applySprite(material, node.sprite, this.meshColor)

    const sprite = new Sprite(material)
    // Like a mesh's maps: the picture arrives long after the frame that asked for it, and the
    // render has to be asked for again when it lands.
    const texture = createSpriteTexture(this.textureCache, material, () => this.redraw())
    texture.apply(node.sprite)
    this.spriteMaps.set(node.id, texture)

    return sprite
  }

  protected buildLight(node: SceneNode & { type: 'light' }): Light {
    const light = lightFor(node.light)

    standTarget(light, this.viewport.scene)

    const helper = helperFor(light)
    if (helper) {
      // The helper answers to the light's id, so a click on it selects the light itself.
      helper.name = node.id
      this.helpers.set(node.id, helper)
      this.viewport.scene.add(helper)
    }

    // Hung under the light so it travels with it, and so a click on it walks up to the light's
    // id. An ambient lamp gets one too: it is the only thing in the viewport that can select it.
    this.dressLight(node.id, light, node.light)
    return light
  }

  /**
   * Markers set right AFTER their nodes are hung: held at their own size whatever scale a node
   * carries, and — for a lamp — turned to where its light actually goes.
   *
   * A pass of its own, and not part of `syncNode`, because both readings walk the chain of
   * PARENTS: a node built during the sync hangs from the scene until `hangFromParent` moves it,
   * so posing it any earlier would answer against the place it no longer is.
   */
  protected poseMarkers(nodes: readonly SceneNode[]): void {
    for (const node of nodes) {
      const marker = this.markers.get(node.id)
      if (!marker) continue

      holdMarkerSize(marker)
      if (node.type === 'light') aimLightMarker(marker, node.light)
    }
  }
}

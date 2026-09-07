import { BufferGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { type CarvedNode, type TextNode } from './sceneState'
import { applyMaterial, applyNegative } from './threeSync'
import { createMaterialTextures } from './materialTextures'
import { DEFAULT_FONT, isSameFont } from '@shared/domain/font'
import { textGeometry } from './textGeometry'
import './bvhPatches'
import { uncutGeometry } from '../csg/uncutGeometry'
import { isNegative } from '../csg/carve'
import { SceneRendererNodeFactory } from './SceneRendererNodeFactory'

export abstract class SceneRendererGeometry extends SceneRendererNodeFactory {
  protected abstract applyDisplay(object: Object3D): void

  /**
   * A solid cut out of other solids. Born wearing its BASE brush — the wall before the window —
   * because ADR-25 refuses an empty node: what the cut has not finished is shown uncut, never
   * missing.
   */
  protected buildCarved(node: CarvedNode): Mesh {
    const material = new MeshStandardMaterial()
    applyMaterial(material, node.material, this.meshColor)
    applyNegative(material, this.negativeColor, isNegative(node))

    // The base brush AS THE RECIPE PLACES IT: its transform carries the matter's scale, so a
    // wall shown uncut while the worker runs is the size it will be once pierced.
    const mesh = new Mesh(uncutGeometry(node.carved), material)
    // The very slots a mesh gets: a solid wears the same descriptor, and without this its maps
    // are named by the document and loaded by nobody.
    const textures = createMaterialTextures(this.textureCache, mesh, material, slot =>
      this.refreshMaterialTexture(slot),
    )
    textures.apply(node.material)
    this.textures.set(node.id, textures)

    void this.recut(node, mesh)

    return mesh
  }

  /**
   * The solid, cut again from whatever the node now says.
   *
   * The evaluator hands out one geometry per distinct graph, so the mesh must never dispose what
   * it is given — `release` is what frees it, and only once the last node lets go.
   */
  protected async recut(node: CarvedNode, into: Mesh): Promise<void> {
    // Recorded BEFORE the await: `release` reads this to know a reference is out, so a node
    // deleted mid-cut is given back exactly once.
    this.cutting.add(node.id)
    const cut = await this.csg.acquire(node.carved)
    const held = this.cutting.delete(node.id)

    // The OBJECT and the RECIPE, never the node itself: any edit — a drag, a rename, a colour —
    // mints a fresh node while leaving `carved` the same, and comparing identity threw the cut
    // away for a solid that still wanted it. `buildModel` compares its holder the same way.
    const applied = this.applied.get(node.id)
    if (!cut || this.objects.get(node.id) !== into || applied?.type !== 'carved') {
      if (cut && held) this.csg.release(node.carved)
      return
    }
    if (applied.carved !== node.carved) {
      if (held) this.csg.release(node.carved)
      return
    }
    const object = into

    // The uncut brush this node was born wearing. Its OWN buffers — `buildCarved` bakes the
    // base transform into them, which a shared shape could never carry — so `freeGeometry` falls
    // through to disposing it, and only a cache that really lends it would say otherwise.
    this.freeGeometry(object.geometry)
    object.geometry = cut
    void this.bvh.accelerate(object)
    // Same reason as a model landing into a wireframe scene: the edges outline the shape that
    // was there before the cut arrived — the uncut brush — until they are built again.
    if (this.needsEdges()) this.applyDisplay(object)
    this.redraw()
  }

  /**
   * Words as a solid. Born with no geometry at all: a face is fetched and parsed long after the
   * frame that asked for it, exactly like a model's file or a mesh's maps.
   */
  protected buildText(node: TextNode): Mesh {
    const material = new MeshStandardMaterial()
    applyMaterial(material, node.material, this.meshColor)

    const mesh = new Mesh(new BufferGeometry(), material)
    void this.reshapeText(node)

    return mesh
  }

  /**
   * The letters, cut again from whatever the node now says.
   *
   * A face nothing can produce falls back to one the studio ships rather than leaving the node
   * invisible — the words are what someone typed, and showing them plainly beats showing nothing.
   * That is not a silent swap: the document keeps the family it names, and `fonts` has already
   * written the failure to the log.
   */
  protected async reshapeText(node: TextNode): Promise<void> {
    const font =
      (await this.fonts.load(node.text.font)) ??
      (isSameFont(node.text.font, DEFAULT_FONT) ? null : await this.fonts.load(DEFAULT_FONT))

    const object = this.objects.get(node.id)
    // The node may have been edited, retyped or deleted while the face was on its way: what is
    // in the scene now is what decides, never what asked.
    if (!font || !(object instanceof Mesh) || this.applied.get(node.id) !== node) return

    // Through the caches like every other shape, though a typed word is never one they lend:
    // the rule holds without an exception to remember, and neither answers for these buffers.
    this.freeGeometry(object.geometry)
    object.geometry = textGeometry(font, node.text)
    // Same reason as a model landing into a wireframe scene: the edges were built from the shape
    // that was there before the face arrived — an empty one at first, the previous words after an
    // edit — and outline a mesh that no longer exists until they are built again.
    if (this.needsEdges()) this.applyDisplay(object)
    this.redraw()
  }
}

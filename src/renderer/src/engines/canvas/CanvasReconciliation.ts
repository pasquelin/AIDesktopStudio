import { type Container, RenderTexture, Sprite } from 'pixi.js'
import {
  allLayers,
  isGroup,
  isRedrawn,
  type AdjustmentLayer,
  type GroupLayer,
  type Layer,
  onPixelGrid,
} from './canvasState'
import { type CanvasSelection } from './canvasSelection'
import { composite, isMaskKey, maskKey, placement, type CompositeNode } from './compositor'
import type { Size } from '../core/geometry'
import type { LayerSurface } from './canvasEngineSupport1'
import type { ClipProxy } from './canvasEngineSupport2'
import { CanvasDocument } from './CanvasDocument'

export abstract class CanvasReconciliation extends CanvasDocument {
  protected abstract publishSelection(selection: CanvasSelection): void

  protected abstract forgetHeld(): void

  protected abstract syncGroup(layer: GroupLayer, box: Size): void

  protected abstract syncAdjustment(layer: AdjustmentLayer): void

  protected abstract syncLayer(layer: Layer): void

  protected abstract attach(nodes: readonly CompositeNode[], parent: Container): void

  protected abstract refreshClips(): void

  protected abstract drop(surface: LayerSurface | undefined): void

  protected abstract hold(key: string, surface: LayerSurface): void

  protected abstract destroyClip(clip: ClipProxy): void

  /**
   * Turns the pixels of every surface a quarter, into a transposed texture — the same order as
   * `applyCrop`: the pixels before the state, so the `apply` the command triggers finds them
   * already the right size and leaves them alone.
   *
   * The turn is in the PIXELS rather than in the layer transforms, and that is what keeps a
   * surface document-sized. Left to the transforms, the sprite would turn while its texture kept
   * the old sides, and `resurface` would recut a portrait texture to a landscape frame — half
   * of every layer, gone, with the undo tiles that could have brought it back.
   *
   * Exact both ways: a quarter turn permutes pixels, it never resamples one.
   */
  turnQuarter(clockwise: boolean): void {
    const renderer = this.app?.renderer
    if (!renderer || !this.state) return

    this.publishSelection(null)
    const { width, height } = this.state

    // A caption and a shape take the turn in their transform instead — see `rotateImage`. Their
    // own space did not turn, so neither their words nor the mask over them may: the drawing key
    // is dropped so the next reconcile lays them out again at the sides the document now has.
    //
    // TOP LEVEL only, exactly like the `moveLayers` that writes those transforms: a caption inside
    // a group is turned by the group, so skipping its pixels here would leave it the one thing in
    // the document still reading the old way.
    //
    // BLIND SPOT: a mask holds painted pixels, not state, so it cannot be redrawn with the words
    // it hides. Left at the old sides, `resurface` recuts it — on a NON-SQUARE document a masked
    // caption loses the paint past the new bounds, and the strip that appears hides nothing.
    const flat = this.redrawnSurfaces()
    for (const [key, surface] of this.surfaces) {
      if (flat.has(key)) continue
      const texture = RenderTexture.create({ width: height, height: width, resolution: 1 })

      const carried = new Sprite(surface.texture)
      carried.rotation = clockwise ? Math.PI / 2 : -Math.PI / 2
      carried.position.set(clockwise ? height : 0, clockwise ? 0 : width)
      renderer.render({ container: carried, target: texture, clear: true })
      carried.destroy({ texture: false, textureSource: false })

      surface.sprite.texture = texture
      surface.texture.destroy(true)
      surface.texture = texture
    }

    this.turnContents(clockwise, width, height)
    this.patches?.dropAll()
    this.forgetHeld()
  }

  private redrawnSurfaces(): Set<string> {
    const flat = new Set<string>()
    for (const layer of this.state?.layers ?? []) {
      if (!isRedrawn(layer)) continue
      flat.add(layer.id).add(maskKey(layer.id))
      this.drawings.delete(layer.id)
    }
    return flat
  }

  private turnContents(clockwise: boolean, width: number, height: number): void {
    for (const [id, laid] of this.contents) {
      this.contents.set(id, {
        x: clockwise ? height - laid.y - laid.height : laid.y,
        y: clockwise ? laid.x : width - laid.x - laid.width,
        width: laid.height,
        height: laid.width,
      })
    }
  }

  /** The stack, made real on the GPU: one texture per paintable layer, in the stack's order. */
  protected reconcile(): void {
    const state = this.state
    if (!state) return

    // The whole tree, not the root: a group holds layers, and a surface judged missing here is
    // a texture destroyed on the GPU. Grouping two layers used to lose their pixels outright.
    const layers = allLayers(state.layers)
    for (const layer of layers) {
      if (isGroup(layer)) this.syncGroup(layer, state)
      else if (layer.kind === 'adjustment') this.syncAdjustment(layer)
      else this.syncLayer(layer)
    }

    // Nothing has been built yet, so no placement has been made either: remembering one here
    // would make the replay in `mount` skip the very tree it exists to build.
    if (!this.app) return

    // Dragging a layer rewrites the stack sixty times a second without restacking it, and the
    // pass below detaches and reattaches every node of the document.
    const nodes = composite(state.layers)
    const stacking = placement(nodes)
    if (stacking !== this.stacking) {
      this.stacking = stacking
      // The tree first: it leaves whatever departed orphaned, so nothing is destroyed while it
      // is still someone's child.
      this.attach(nodes, this.world)
      this.dropDeparted(layers)
    }

    // Last, and outside the guard: `attach` is where a proxy is born, and a base that moved
    // without restacking still has to drag its stencil along.
    this.refreshClips()
    this.applyFiltering()
  }

  // Walked rather than tracked: the grid flips under surfaces that exist, and a departed one
  // comes back with the mode it left with. Nearest for minification too, as Aseprite does.
  // `update()` is what reaches the GPU: Pixi 8.19 writes the filters and emits nothing.
  protected applyFiltering(): void {
    const scaleMode = onPixelGrid(this.state) ? 'nearest' : 'linear'
    for (const { texture } of this.surfaces.values()) {
      if (texture.source.scaleMode === scaleMode) continue
      texture.source.scaleMode = scaleMode
      texture.source.style.update()
    }
  }

  /** Frees what the stack no longer holds. A layer that left took its pixels with it. */
  protected dropDeparted(layers: readonly Layer[]): void {
    const kept = new Set<string>()
    for (const layer of layers) {
      kept.add(layer.id)
      // Its presence, not `enabled`: unticking the box hides a mask, it does not erase it.
      if (layer.mask) kept.add(maskKey(layer.id))
    }

    this.dropDepartedSurfaces(kept)
    this.dropDepartedContainers(kept)
    this.dropDepartedClips(layers)
  }

  private dropDepartedSurfaces(kept: Set<string>): void {
    for (const [id, surface] of this.surfaces) {
      if (kept.has(id)) continue
      // Held rather than destroyed: the command that took this layer out of the stack is
      // undoable, and its pixels are not in the state that would come back.
      //
      // MASKS ARE NOT HELD, and that is a decision rather than an oversight. A mask is keyed on
      // the layer that wears it and carries no identity of its own, so a mask REMOVED and a mask
      // CREATED afterwards are the same key: holding one would hand a fresh mask the pixels of
      // the old one, silently. The cost is that ⌘Z on a removed mask still gives back a white
      // one — the smaller of the two wrongs, and the only one the state can tell apart.
      if (isMaskKey(id)) this.drop(surface)
      else this.hold(id, surface)
      this.surfaces.delete(id)
      this.contents.delete(id)
    }
  }

  private dropDepartedContainers(kept: Set<string>): void {
    for (const [id, container] of this.groups) {
      if (kept.has(id)) continue
      // Emptied first, and destroyed without `children`: ungrouping keeps the layers, and
      // taking their sprites down with the container is the same lost-pixels bug in reverse.
      container.removeChildren()
      container.destroy()
      this.groups.delete(id)
    }

    for (const [id, pass] of this.adjustments) {
      if (kept.has(id)) continue
      // Emptied first: what it graded are layers that live on without it.
      pass.removeChildren()
      pass.destroy()
      this.adjustments.delete(id)
    }

    for (const id of this.drawings.keys()) {
      // Its texture went with it, so the words have to be drawn again on the way back.
      if (!kept.has(id)) this.drawings.delete(id)
    }
  }

  private dropDepartedClips(layers: readonly Layer[]): void {
    const clipping = new Set(layers.filter(layer => layer.clipped).map(layer => layer.id))
    for (const [id, clip] of this.clips) {
      if (clipping.has(id) && this.surfaces.has(clip.baseId)) continue
      this.destroyClip(clip)
      this.clips.delete(id)
    }
  }
}

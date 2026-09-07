import { Container, Sprite } from 'pixi.js'
import { createAdjustFilter } from './adjustFilter'
import { layerById, type AdjustmentLayer, type Transform } from './canvasState'
import { maskKey, type CompositeNode } from './compositor'
import type { Size } from '../core/geometry'
import type { LayerSurface } from './canvasEngineSupport1'
import { bytesOf, DEPARTED_BUDGET } from './canvasEngineSupport2'
import type { ClipProxy } from './canvasEngineSupport2'
import { CanvasReconciliation } from './CanvasReconciliation'

export abstract class CanvasLayerTree extends CanvasReconciliation {
  protected abstract place(target: Container, transform: Transform, box: Size): void

  /**
   * Keeps a departed surface against the undo that may bring its layer back, evicting the least
   * recently held once what is kept passes `DEPARTED_BUDGET`.
   *
   * BLIND SPOT, and it is the price of holding anything at all: an eviction tells nobody. The
   * history entry stays on the stack, and undoing back past an evicted surface gives the layer
   * back EMPTY — which is what happened to every one of them before this existed, so the bargain
   * is a smaller version of the same one `PixelPatches` already makes with its tiles. What it
   * does not have is `PixelPatches`'s `onDropped`, which takes the dead entry off the stack.
   */
  protected hold(key: string, surface: LayerSurface): void {
    const replaced = this.departed.get(key)
    if (replaced) this.kept -= bytesOf(replaced.texture)
    this.drop(replaced)
    this.departed.delete(key)

    this.departed.set(key, surface)
    this.kept += bytesOf(surface.texture)

    for (const [oldest, held] of this.departed) {
      if (this.kept <= DEPARTED_BUDGET) break
      this.kept -= bytesOf(held.texture)
      this.drop(held)
      this.departed.delete(oldest)
    }
  }

  /**
   * Frees every held surface. What a recut, a resample or a turn makes of all of them at once:
   * they hold the sides the document no longer has, so `buildSurface` would refuse each in turn
   * — and until then they sit on the card for nothing.
   */
  protected forgetHeld(): void {
    for (const held of this.departed.values()) this.drop(held)
    this.departed.clear()
    this.kept = 0
  }

  protected drop(surface: LayerSurface | undefined): void {
    if (!surface) return
    surface.sprite.destroy()
    // The texture lives on the GPU: dropping the reference is not enough.
    surface.texture.destroy(true)
  }

  /** Bottom first, so the last node of a level is the one the eye sees on top. */
  protected attach(nodes: readonly CompositeNode[], parent: Container): void {
    parent.removeChildren()

    for (const node of nodes) {
      if (node.kind === 'group') {
        const container = this.groups.get(node.id)
        if (!container) continue
        this.attach(node.children, container)
        parent.addChild(container)
        continue
      }

      if (node.kind === 'adjust') {
        const pass = this.adjustments.get(node.id)
        if (!pass) continue
        // What it covers goes inside it: the filter grades the pass, not a sibling beside it.
        this.attach(node.children, pass)
        parent.addChild(pass)
        continue
      }

      this.attachSurface(node, parent)
    }
  }

  private attachSurface(
    node: Extract<CompositeNode, { kind: 'surface' }>,
    parent: Container,
  ): void {
    const surface = this.surfaces.get(node.id)
    if (!surface) return

    // A clipped layer hangs in a container of its own: an object carries one mask, and a
    // clipped layer that also has a mask of its own needs two.
    const clip = node.clippedBy === null ? null : this.clipProxy(node.id, node.clippedBy)
    const holder = clip ?? parent

    const mask =
      node.maskedBy === null || !node.maskEnabled
        ? null
        : (this.surfaces.get(maskKey(node.maskedBy)) ?? null)
    // Pixi reads the alpha of whatever it is handed, and only if that object is in the tree:
    // the mask sprite is attached alongside the layer it hides, and never drawn on its own.
    if (mask) holder.addChild(mask.sprite)
    surface.sprite.mask = mask?.sprite ?? null

    holder.addChild(surface.sprite)
    if (clip) parent.addChild(clip)
  }

  /**
   * The container that cuts a clipped layer out of the one below it, emptied and ready to be
   * filled. `null` when the base holds no pixels — a clipped layer with nothing under it is not
   * clipped at all, and hiding it would lose its pixels for a reason nobody could see.
   */
  protected clipProxy(layerId: string, baseId: string): Container | null {
    const base = this.surfaces.get(baseId)
    if (!base) return null

    let clip = this.clips.get(layerId)
    if (clip?.baseId !== baseId) {
      if (clip) this.destroyClip(clip)
      // The base is already being drawn: an object cannot be both the picture and the stencil,
      // so the proxy shares its texture and nothing else. Three clipped layers on one base take
      // three proxies, and all three stay visible.
      const sprite = new Sprite(base.texture)
      const host = new Container()
      // On the alpha, not on the default red channel: what cuts a clipped layer out is where the
      // base has pixels, not how red they are. A base painted pure blue would cut out nothing.
      host.setMask({ mask: sprite, channel: 'alpha' })
      clip = { baseId, sprite, host }
      this.clips.set(layerId, clip)
    }

    clip.host.removeChildren()
    clip.host.addChild(clip.sprite)
    return clip.host
  }

  protected destroyClip(clip: ClipProxy): void {
    clip.host.removeChildren()
    // Cleared first: `destroy` drops the effect without handing it back to Pixi's pool.
    clip.host.mask = null
    clip.host.destroy()
    // Without its texture: the proxy is the one sprite that borrows another layer's.
    clip.sprite.destroy()
  }

  /** The proxies follow their base: a stencil a frame behind the layer it cuts would show a seam. */
  protected refreshClips(): void {
    const state = this.state
    if (!state) return

    for (const clip of this.clips.values()) {
      const base = this.surfaces.get(clip.baseId)
      const layer = layerById(state, clip.baseId)
      if (!base || !layer) continue

      // From the state, through the one placement path the engine has: a second one would drift.
      this.place(clip.sprite, layer.transform, base.texture)
      // A stencil is only as strong as the base it stands for: hiding the base has to hide what
      // is clipped to it, and fading the base has to fade it.
      clip.sprite.visible = layer.visible
      clip.sprite.alpha = layer.opacity * layer.fillOpacity
    }
  }

  /**
   * The grading pass of one adjustment layer. It holds no texture and no sprite: what it owns is
   * a container carrying a filter, and what the filter grades is whatever `attach` puts in it.
   */
  protected syncAdjustment(layer: AdjustmentLayer): void {
    let pass = this.adjustments.get(layer.id)
    if (!pass) {
      const filter = createAdjustFilter()
      pass = Object.assign(new Container({ label: layer.id }), { filter })
      pass.filters = [filter]
      this.adjustments.set(layer.id, pass)
    }

    // Never `visible` or `alpha` on the container: it holds the layers it grades, so hiding it
    // would hide the whole stack under it. Hiding a grading is dropping its pass.
    //
    // Written only when it turns, exactly as `syncGroup` writes its own: Pixi copies and freezes
    // the array on every assignment, and this runs for every grading on every state handed in —
    // sixty times a second while a layer is dragged.
    if (layer.visible !== (pass.filters ?? []).length > 0) {
      pass.filters = layer.visible ? [pass.filter] : []
    }
    pass.filter.grade(layer.values)
  }
}

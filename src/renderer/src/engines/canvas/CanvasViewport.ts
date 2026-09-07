import { AlphaFilter, Assets, Container, Sprite, type Texture } from 'pixi.js'
import { assetUrl } from '@shared/domain/asset'
import { type GroupLayer, type Transform } from './canvasState'
import type { Size } from '../core/geometry'
import type { CanvasTool } from './canvasTool'
import { containIn, sameViewport, type CanvasView, type Viewport } from './viewport'
import { BLEND_BY_MODE } from './canvasEngineSupport1'
import { lease } from './canvasEngineSupport2'
import { CanvasLayerTree } from './CanvasLayerTree'

export abstract class CanvasViewport extends CanvasLayerTree {
  protected abstract place(target: Container, transform: Transform, box: Size): void

  protected abstract render(): void

  protected abstract shownViewport(): Viewport

  protected abstract forgetHover(): void

  public abstract dropCrop(): void

  protected abstract tuneSoftener(): void

  protected syncGroup(layer: GroupLayer, box: Size): void {
    let container = this.groups.get(layer.id)
    if (!container) {
      container = new Container({ label: layer.id })
      this.groups.set(layer.id, container)
    }

    container.visible = layer.visible
    container.alpha = layer.opacity
    container.blendMode = BLEND_BY_MODE[layer.blend]
    // A group composites on itself before the stack sees it, which is what an offscreen pass
    // does — and a neutral filter is the only way v8 offers to ask for one. Without it a
    // container's `blendMode` is merely inherited, and every child overwrites it with its own;
    // its `alpha` multiplies per child, so two overlapping layers show through each other.
    //
    // Only where it would show, because the pass costs a render target per group.
    const composed = layer.isolation === 'isolate' || layer.blend !== 'normal' || layer.opacity < 1
    // Written only when it turns: Pixi copies and freezes the array on every assignment, and
    // this runs for every group of the document on every state it is handed.
    if (composed !== (container.filters ?? []).length > 0) {
      container.filters = composed ? [this.isolationPass()] : []
    }
    // A group holds no texture, so the document is the box its origin is a fraction of.
    this.place(container, layer.transform, box)
  }

  protected isolationPass(): AlphaFilter {
    // One per engine, shared by every isolated group: a filter carries no per-object state.
    this.isolation ??= new AlphaFilter()
    return this.isolation
  }

  /**
   * Draws a picture into a layer's texture, laid inside the document without deforming it.
   *
   * `url` is a `ai-desktop-studio://asset/<id>`: the renderer has no filesystem, and the main process
   * serves the scheme against the catalogue.
   */
  async loadInto(layerId: string, url: string, clear = false): Promise<void> {
    const mounting = this.mounting
    const surface = this.surfaces.get(layerId)
    if (!surface || !this.app || !this.state) return

    // The scheme carries no extension, so nothing in the URL tells Pixi what to make of it.
    const texture = await Assets.load({ src: url, parser: 'texture' })
    if (!this.loaded.has(url)) {
      this.loaded.add(url)
      lease(url)
    }
    if (mounting !== this.mounting || this.surfaces.get(layerId) !== surface) return
    const renderer = this.app?.renderer
    if (!renderer || !this.state) return
    this.drawLoadedTexture(layerId, texture, clear, renderer, surface)
  }

  private drawLoadedTexture(
    layerId: string,
    texture: Texture,
    clear: boolean,
    renderer: NonNullable<NonNullable<typeof this.app>['renderer']>,
    surface: NonNullable<ReturnType<typeof this.surfaces.get>>,
  ): void {
    if (!this.state) return
    const laid = clear
      ? { x: 0, y: 0, width: texture.width, height: texture.height }
      : containIn(texture, { width: this.state.width, height: this.state.height })
    this.contents.set(layerId, laid)
    this.corners = { of: null, tool: null, box: null }
    this.overlay.invalidate()
    const sprite = new Sprite(texture)
    sprite.position.set(laid.x, laid.y)
    sprite.setSize(laid.width, laid.height)

    renderer.render({ container: sprite, target: surface.texture, clear })
    sprite.destroy()
    this.render()
  }

  /**
   * Drops a rewritten picture from the loader's cache, so the next layer placed from that asset
   * draws what is on disk now.
   *
   * The cache is keyed on the URL and lives for the session, so ⌘S over an asset would otherwise
   * be invisible to every OTHER document that places it — the loader answers from memory and
   * never asks the scheme again.
   *
   * `unload` frees the GPU texture as well, so it must not run while something still draws from
   * it. Nothing here does: `loadInto` renders it into the layer's own surface and destroys the
   * sprite in the same breath. Skipped when the loader never held it — unloading a URL it does
   * not know is not something to make a caller think about.
   */
  async forgetPicture(assetId: string): Promise<void> {
    const url = assetUrl(assetId)
    if (Assets.get(url) === undefined) return
    await Assets.unload(url)
  }

  /**
   * What the rulers are graduated in. Pushed like the view rather than read off
   * `documentElement.lang`: that attribute is a projection written for screen readers, and it
   * carries no notification — the rulers would keep the language they were mounted in while the
   * inspector beside them changed.
   */
  setLanguage(language: string): void {
    if (language === this.language) return
    this.language = language
    this.overlay.invalidate()
  }

  /** Pan, zoom, and what the overlay shows. Pushed in, never read out: React owns it. */
  setView(view: CanvasView): void {
    // Only the engine's own viewport coming back is stale — taking it would snap the canvas to
    // where the pan was a frame ago. Anything else is a command (⌘0 during a trackpad glide,
    // typically), and swallowing it would lose it in both the engine and the store.
    const echo = this.published !== null && sameViewport(view.viewport, this.published)
    this.view = { ...view, viewport: echo ? (this.publishing ?? view.viewport) : view.viewport }
    // The overlay hears about EVERY view, not only the ones that move the world: the rulers, the
    // guides and the snapping live in this same object, and they change with the viewport still.
    this.overlay.invalidate()
    this.applyViewport()
  }

  protected applyViewport(): void {
    if (this.placeWorld()) this.render()
  }

  /** Moves the world to the shown viewport, and says whether it moved at all. */
  protected placeWorld(): boolean {
    const shown = this.shownViewport()
    // Nothing moved since it was last APPLIED, so nothing is redrawn: every frame of a pan comes
    // through here twice — the pointer, then the store's echo — and the second composited the
    // whole document again over identical numbers. Against what was APPLIED and not against the
    // node, whose default a mount already matches.
    if (this.applied && sameViewport(this.applied, shown)) return false
    this.applied = shown

    this.world.position.set(shown.x, shown.y)
    this.world.scale.set(shown.scale)
    // A zoom slides the grips out from under a still hand. Not while a gesture is open: that one
    // owns the cursor — a pan holds `grabbing` across every frame it moves the view by.
    if (this.gesture.kind === 'none') this.forgetHover()
    this.overlay.invalidate()
    return true
  }

  /**
   * Moves the view now and tells React once a frame. Routing every pointer move through the store
   * and back would put a React commit between the gesture and the pixels it moves — the zoom
   * readout is the only thing that needs to hear about it, and it can hear about it a frame later.
   */
  protected moveTo(viewport: Viewport): void {
    this.view = { ...this.view, viewport }
    this.applyViewport()

    this.publishing = viewport
    if (this.publishFrame === 0) this.publishFrame = requestAnimationFrame(this.publish)
  }

  protected readonly publish = (): void => {
    this.publishFrame = 0
    const viewport = this.publishing
    this.publishing = null
    if (!viewport) return

    this.published = viewport
    this.options.onViewport(viewport)
  }

  setTool(tool: CanvasTool): void {
    // A frame belongs to the tool that placed it: leaving it up under the brush would keep ⏎
    // bound to a crop nothing on screen still explains.
    if (tool !== 'crop') this.dropCrop()
    this.tool = tool
    this.tuneSoftener()
    // The pencil and the brush read the same settings and spread them differently: switching
    // between them changes the edge with nothing else moving.
    // The chrome belongs to the tool that draws it: without this the move tool's grips stayed on
    // screen under the brush until something else happened to invalidate.
    this.forgetHover()
  }
}

import { RenderTexture, Sprite, type Application } from 'pixi.js'
import { mountApplication } from '../core/mount'
import { onPaletteChange } from '../core/palette'
import { type CanvasState, onPixelGrid } from './canvasState'
import { PixelPatches } from './PixelPatches'
import type { Point, Size } from '../core/geometry'
import { ORIGIN } from './canvasEngineSupport2'
import { CanvasStateBinding } from './CanvasStateBinding'

export abstract class CanvasDocument extends CanvasStateBinding {
  protected abstract readPalette(canvas: HTMLCanvasElement): void

  protected abstract readonly onPointerDown: (event: PointerEvent) => void

  protected abstract readonly onDoubleClick: (event: MouseEvent) => void

  protected abstract readonly onPointerMove: (event: PointerEvent) => void

  protected abstract readonly onPointerLeave: () => void

  protected abstract readonly onPointerUp: (event: PointerEvent) => void

  protected abstract readonly onKeyDown: (event: KeyboardEvent) => void

  protected abstract readonly onKeyUp: (event: KeyboardEvent) => void

  protected abstract readonly onBlur: () => void

  protected abstract readonly onWheel: (event: WheelEvent) => void

  protected abstract measure(): void

  protected abstract reconcile(): void

  protected abstract render(): void

  protected abstract forgetHover(): void

  protected abstract tuneSoftener(): void

  protected abstract applyFiltering(): void

  protected abstract placeWorld(): boolean

  public abstract dropCrop(): void

  protected abstract frameDocument(): void

  protected abstract forgetHeld(): void

  async mount(host: HTMLElement): Promise<void> {
    const mounting = (this.mounting += 1)
    const app = await mountApplication(
      {
        resizeTo: host,
        backgroundAlpha: 0,
        // Nothing here animates by itself: every change calls `render`. Left on, Pixi would draw
        // the whole stage sixty times a second for a document nobody is touching.
        autoStart: false,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
        // The advanced blend modes read the back buffer. Without it WebGL warns once and
        // composites every one of them as `normal`.
        useBackBuffer: true,
      },
      // The mount counter rather than `disposed`: it also catches a remount onto the same
      // engine, where the first `init` resolves after the second has claimed the element.
      () => mounting !== this.mounting,
    )
    if (!app) return
    this.finishMount(app, host)
  }

  private finishMount(app: Application, host: HTMLElement): void {
    const canvas = app.canvas
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    host.appendChild(canvas)

    this.app = app
    this.host = host
    this.patches = new PixelPatches(app.renderer, this.options.onPixelsDropped)
    app.stage.addChild(this.world)
    this.readPalette(canvas)
    // The theme can change while a document is open, and the overlay is the one surface that
    // holds its colours in JavaScript rather than in CSS.
    this.stopPaletteWatch = onPaletteChange(() => this.readPalette(canvas))
    this.overlay.mount(host)

    host.addEventListener('pointerdown', this.onPointerDown)
    host.addEventListener('dblclick', this.onDoubleClick)
    host.addEventListener('pointermove', this.onPointerMove)
    host.addEventListener('pointerleave', this.onPointerLeave)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    host.addEventListener('wheel', this.onWheel, { passive: false })

    this.resizer = new ResizeObserver(() => this.measure())
    this.resizer.observe(host)
    this.measure()

    // React pushed the state while `init` was still in flight — it always does, the effect that
    // pushes it runs in the same flush as the one that mounts. Reconciling directly rather than
    // through `apply`, whose guard would see the state it already holds and do nothing: that is
    // the difference between a document that opens paintable and one that opens empty.
    this.reconcile()
    this.render()
  }

  /** Reflects a state it never computes: layers appear, reorder and fade from here only. */
  apply(state: CanvasState): void {
    const previous = this.state
    const resized = previous?.width !== state.width || previous?.height !== state.height
    this.state = state
    this.overlay.invalidate()

    // Above the guard below on purpose: arming another layer keeps `layers` identical, so this
    // is the one path a box can move under a still pointer without the tree changing at all.
    if (previous !== state) this.forgetHover()

    // Dragging a guide rewrites the state sixty times a second and touches no pixel: walking the
    // tree and re-rendering the stage for it would be a full GPU frame per pointer move.
    // Grid on or off only: a change of cell size touches no surface. A FIRST state counts as a
    // change too: a softener hung by `setTool` before it would stay hung on the grid.
    const regridded = onPixelGrid(previous) !== onPixelGrid(state)
    if (regridded) this.applyGridChange()
    if (previous && previous.layers === state.layers && !resized)
      return this.renderGridChange(regridded)

    // A frame is placed against a document that no longer exists: a quarter turn or a resample
    // under it would leave ⏎ cropping to a rectangle outside the picture, which recuts every
    // surface to nothing and throws the undo tiles away with them.
    this.applyDocumentChange(previous, state, resized)
  }

  private applyDocumentChange(
    previous: CanvasState | null,
    state: CanvasState,
    resized: boolean,
  ): void {
    if (resized) this.dropCrop()
    if (previous && resized) this.resurface(state)
    this.reconcile()
    if (resized && this.framed) this.frameDocument()
    this.render()
  }

  private applyGridChange(): void {
    this.tuneSoftener()
    this.wheelDebt = 0
  }

  private renderGridChange(changed: boolean): void {
    if (!changed) return
    this.applyFiltering()
    this.placeWorld()
    this.render()
  }

  /**
   * Rebuilds every surface at the document's new size, masks included, and copies the old picture
   * into it. Until this existed a texture was allocated once, at whatever size the document had
   * when the layer was born, and never grew: a quarter turn left the layers outside the frame,
   * and merging or flattening had nowhere document-sized to compose into.
   *
   * `from` is the corner the kept picture starts at. A crop moves it; a resample or a quarter
   * turn leaves it at the origin. It has to be carried here rather than through the layer
   * transforms: a surface is document-sized, so the new one only has room for the kept region,
   * and a copy landing at the origin would keep the document's top-left corner instead — the
   * frame would then come out empty wherever `from` pushed past the new width.
   *
   * A surface already at that size is left alone: the crop recuts the pixels before the command
   * that reports the new frame, and the `apply` that follows must not undo its work.
   *
   * Shrinking loses what falls outside, and the undo tiles go with it: the frame comes back on
   * ⌘Z, the pixels it cut away do not.
   */
  protected resurface(size: Size, from: Point = ORIGIN): void {
    const renderer = this.app?.renderer
    if (!renderer || this.surfaces.size === 0) return

    let recut = false
    for (const surface of this.surfaces.values()) {
      if (surface.texture.width === size.width && surface.texture.height === size.height) continue
      recut = true

      const texture = RenderTexture.create({
        width: size.width,
        height: size.height,
        resolution: 1,
      })

      const carried = new Sprite(surface.texture)
      carried.position.set(-from.x, -from.y)
      renderer.render({ container: carried, target: texture, clear: true })
      // The old texture is destroyed just below, so its source must not go with the sprite.
      carried.destroy({ texture: false, textureSource: false })

      surface.sprite.texture = texture
      surface.texture.destroy(true)
      surface.texture = texture
    }

    // The pixels were carried over translated by `-from`, and nothing re-runs `loadInto` here —
    // so the remembered picture rects have to travel the same distance. Left where they were, a
    // crop would leave every picture layer's grips at the coordinates the OLD document used.
    if (recut) {
      for (const [id, laid] of this.contents) {
        this.contents.set(id, { ...laid, x: laid.x - from.x, y: laid.y - from.y })
      }
      this.patches?.dropAll()
      this.forgetHeld()
    }
  }
}

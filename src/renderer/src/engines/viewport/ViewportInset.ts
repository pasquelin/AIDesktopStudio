import {
  LinearSRGBColorSpace,
  NoToneMapping,
  SRGBColorSpace,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { aspectLoan } from './aspectLoan'
import { glRect } from './panes'
import type { InsetPane, InsetBlit } from './viewportEngineSupport1'
import { ViewportDrawing } from './ViewportDrawing'

export abstract class ViewportInset extends ViewportDrawing {
  protected abstract insetBlitOf(renderer: WebGLRenderer): InsetBlit

  /**
   * The target the preview is drawn into, at the size it is shown — one device pixel per pixel,
   * so the picture is the one the direct pass used to put on the canvas.
   *
   * Multisampled to the same count as the canvas: the drawing buffer is antialiased, and a
   * preview that stopped being would read as a downgrade rather than as a saving.
   *
   * **What it costs, said out loud**: a GROWN preview holds a target the size of the canvas —
   * at 2736×1848 with 4 samples, some 160 MB of colour and depth for as long as it stays grown,
   * freed when it is folded back or closed. Bought deliberately: at that size the panes are
   * skipped and the frame went from 7,4 ms of CPU to nothing, on a machine where the CPU is what
   * runs out first.
   */
  protected insetTargetOf(
    renderer: WebGLRenderer,
    width: number,
    height: number,
  ): WebGLRenderTarget {
    const held = this.insetHeld
    if (held && held.width === width && held.height === height) return held

    held?.dispose()
    // What the DRAWING BUFFER is antialiased to, held to what the context can offer. The ceiling
    // comes from three rather than from `gl.MAX_SAMPLES`, which the WebGL1 typing has no name for.
    const gl = renderer.getContext()
    const samples = Math.max(
      0,
      Math.min(Number(gl.getParameter(gl.SAMPLES) ?? 0), renderer.capabilities.maxSamples),
    )
    const target = new WebGLRenderTarget(width, height, { samples })
    // Linear, which is what a render into a target writes whatever the texture says — three picks
    // the WORKING space for anything but the canvas (`WebGLRenderer`, the `colorSpace` it hands
    // its output pass). Declared rather than left at the default so the quad below does not
    // decode a second time.
    target.texture.colorSpace = LinearSRGBColorSpace
    this.insetBlitOf(renderer).material.map = target.texture

    this.insetHeld = target
    // A target that has just been made holds NOTHING, so the cadence must not hold its first
    // draw back: compositing it before then samples an empty texture, and a panel being dragged
    // wider would flash the preview black for as long as the cap lasts.
    this.insetStale = true
    this.insetDrawnAt = Number.NEGATIVE_INFINITY
    return target
  }

  /** Draws the preview into its target. The costly half, and the one the cache exists to skip. */
  protected drawInset(
    renderer: WebGLRenderer,
    inset: InsetPane,
    target: WebGLRenderTarget,
    panesDrawn: boolean,
  ): void {
    const restore = this.options.onInset?.(inset.camera)
    renderer.getClearColor(this.insetClear)
    const heldAlpha = renderer.getClearAlpha()
    const heldAutoClear = renderer.autoClear
    const heldMatrix = this.scene.matrixWorldAutoUpdate
    const loan = aspectLoan(target.width, target.height)

    // Reuse the pane pass matrices; a grown inset skips that pass and must update them itself.
    if (panesDrawn) this.scene.matrixWorldAutoUpdate = false

    try {
      renderer.setRenderTarget(target)
      renderer.autoClear = true
      renderer.setClearColor(inset.backdrop, 1)
      loan.frame(inset.camera)
      this.dressInsetBlit(
        renderer,
        target,
        this.drawScene({
          scene: this.scene,
          camera: inset.camera,
          surface: 'inset',
          paneIndex: 0,
          cameraNodeId: inset.cameraNodeId,
          target,
          rect: null,
          width: target.width,
          height: target.height,
        }),
      )
    } finally {
      loan.restore()
      this.scene.matrixWorldAutoUpdate = heldMatrix
      renderer.autoClear = heldAutoClear
      renderer.setClearColor(this.insetClear, heldAlpha)
      renderer.setRenderTarget(null)
      // In a `finally`, as `renderPanes` does: a throw here would otherwise leave the workshop
      // hidden for every later frame.
      restore?.()
    }
  }

  /**
   * How the preview's quad reads what was just drawn into its target, and it is not a detail: get
   * it wrong and the preview comes back doubly tone-mapped, or washed out, with every gate green.
   *
   * A PLAIN render leaves the working space in the target — three skips tone mapping for anything
   * but the canvas — so the quad wears the curve on the way out and the texture stays linear. A
   * COMPOSED one has already been through the output transform, so the texture holds sRGB and the
   * quad must apply nothing: it is declared sRGB so three decodes it once and the canvas encodes
   * it once, which is the identity.
   */
  protected dressInsetBlit(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget,
    composed: boolean,
  ): void {
    const blit = this.insetBlitOf(renderer)
    const space = composed ? SRGBColorSpace : LinearSRGBColorSpace
    const toneMapped = !composed && renderer.toneMapping !== NoToneMapping

    if (target.texture.colorSpace !== space) {
      target.texture.colorSpace = space
      // The colour space is a shader DEFINE on the material sampling it, not a uniform.
      blit.material.needsUpdate = true
    }
    if (blit.material.toneMapped !== toneMapped) {
      blit.material.toneMapped = toneMapped
      blit.material.needsUpdate = true
    }
  }

  /**
   * Puts the drawn preview on the canvas: one textured quad inside the scissor, and nothing else.
   *
   * This is what a frame costs when only the view moved — one draw call against the second full
   * traversal of the scene the direct pass paid for.
   */
  protected compositeInset(renderer: WebGLRenderer, inset: InsetPane): void {
    const surface = renderer.domElement.clientHeight
    const gl = glRect(inset.rect, surface)
    const blit = this.insetBlitOf(renderer)
    const heldAutoClear = renderer.autoClear

    renderer.setScissorTest(true)
    try {
      // A grown preview leaves the panes undrawn, and the DOM frame keeps two pixels of canvas
      // outside the picture: cleared here, or those pixels would hold whatever the last frame
      // that did draw them left behind.
      if (this.insetCoversAll()) {
        renderer.setScissor(0, 0, renderer.domElement.clientWidth, surface)
        renderer.setClearColor(inset.backdrop, 1)
        renderer.clear(true, true, false)
      }
      renderer.setViewport(gl.x, gl.y, gl.width, gl.height)
      renderer.setScissor(gl.x, gl.y, gl.width, gl.height)
      renderer.autoClear = false
      blit.quad.renderToScreen(blit.material)
    } finally {
      renderer.autoClear = heldAutoClear
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, renderer.domElement.clientWidth, surface)
    }
  }

  /** The target and the quad, both held by the GPU until something says otherwise. */
  protected disposeInset(): void {
    this.insetHeld?.dispose()
    this.insetHeld = null

    this.insetBlit?.quad.dispose()
    this.insetBlit?.material.dispose()
    this.insetBlit = null
  }
}

import { type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { glRect } from './panes'
import { INSET_CADENCE_MS } from './viewportEngineSupport1'
import type { DrawRequest, InsetPane } from './viewportEngineSupport1'
import { ViewportRenderLoop } from './ViewportRenderLoop'

export abstract class ViewportDrawing extends ViewportRenderLoop {
  protected abstract readonly renderFrame: () => void

  protected abstract insetTargetOf(
    renderer: WebGLRenderer,
    width: number,
    height: number,
  ): WebGLRenderTarget

  protected abstract drawInset(
    renderer: WebGLRenderer,
    inset: InsetPane,
    target: WebGLRenderTarget,
    panesDrawn: boolean,
  ): void

  protected abstract catchUpInset(now: number): void

  protected abstract compositeInset(renderer: WebGLRenderer, inset: InsetPane): void

  /** Whether the surface was actually taken: a panel folded to nothing is turned back. */
  protected readonly onResize = (): boolean => {
    const canvas = this.renderer?.domElement
    if (!canvas || !this.renderer) return false

    const { clientWidth, clientHeight } = canvas
    if (clientWidth === 0 || clientHeight === 0) return false

    this.renderer.setSize(clientWidth, clientHeight, false)
    // The main camera follows its own pane, not the canvas: in a quad layout that is a quarter
    // of it, and an aspect taken from the whole surface stretches every one of the four. Both
    // sides of the ratio are non-zero — the guard above turned back a surface with no height.
    const main = this.layOutPanes()
    this.perspective.aspect = main.width / main.height
    this.perspective.updateProjectionMatrix()
    this.fitProjection()
    this.requestRender()
    return true
  }

  /**
   * Runs the frame already asked for, now, and whatever was still moving keeps its loop.
   *
   * A motion of its own drew earlier in this same turn, into the buffer `setSize` then blanked:
   * a drag of a splitter over a moving scene costs two renders per paint, and nothing can spare
   * the first — the resize is only known about after it.
   */
  protected drawPendingFrame(): void {
    if (this.frame === null) return
    cancelAnimationFrame(this.frame)
    this.renderFrame()
  }

  /**
   * The ONE call every surface of the studio draws a 3D scene through — the panes, the camera
   * preview, and whatever renders off screen.
   *
   * `onDraw` is offered the request first and answers whether it drew. That answer is not
   * decoration: what it composed is tone-mapped and encoded on the way OUT, where a plain render
   * leaves the working space behind, and both the preview's quad and a film's pixels have to know
   * which of the two they are looking at.
   */
  drawScene(request: DrawRequest): boolean {
    const renderer = this.renderer
    if (!renderer) return false

    // BEFORE `onDraw`, and it is the whole contract: a film and a still hand over a target and
    // then read its pixels back, so whoever draws must be pointed at it. Bound here rather than
    // by each caller — a composition that plans no pass answers `false` without `PostComposer`
    // ever running, and the plain render below would have gone to the canvas.
    renderer.setRenderTarget(request.target)
    if (this.options.onDraw?.(request) === true) return true

    renderer.render(request.scene, request.camera)
    return false
  }

  /**
   * One render in a single layout, four scissored ones in a quad — never four contexts.
   *
   * A second WebGL context per view would quadruple what the machine holds for a view that shows
   * the same scene, and a consumer GPU drops the oldest context when it runs out. The scissor is
   * what keeps a pane from clearing the three beside it.
   */
  protected renderPanes(renderer: WebGLRenderer, refreshAllShadows: () => void): void {
    const ratio = renderer.getPixelRatio()

    if (this.extras.length === 0) {
      this.renderSinglePane(renderer, ratio, refreshAllShadows)
      return
    }

    const height = renderer.domElement.clientHeight

    renderer.setScissorTest(true)
    try {
      // Walked by index rather than over `paneCameras`: that getter builds an array, and one
      // built per frame is one allocation per frame for a list of four that never changes.
      for (const [index, rect] of this.rects.entries()) {
        const camera = this.cameraOfPane(index)
        if (!camera) continue

        const { x, y, width, height: paneHeight } = glRect(rect, height)
        renderer.setViewport(x, y, width, paneHeight)
        renderer.setScissor(x, y, width, paneHeight)
        // A pane that put the scene's lights out draws different shadows from the one beside
        // it: what THIS pane wears is what its maps have to be drawn from.
        if (this.options.onPane?.(index, camera) === true) {
          refreshAllShadows()
          renderer.shadowMap.needsUpdate = true
        }
        this.drawScene({
          scene: this.scene,
          camera,
          surface: 'pane',
          paneIndex: index,
          cameraNodeId: null,
          target: null,
          rect: { x, y, width, height: paneHeight },
          width: Math.round(width * ratio),
          height: Math.round(paneHeight * ratio),
        })
      }
    } finally {
      // In a `finally`, and both of them: a throw mid-pane would otherwise leave every later
      // frame — overlay included — clipped to whichever quarter failed.
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, renderer.domElement.clientWidth, height)
    }
  }

  private renderSinglePane(
    renderer: WebGLRenderer,
    ratio: number,
    refreshAllShadows: () => void,
  ): void {
    if (this.options.onPane?.(0, this.camera) === true) {
      refreshAllShadows()
      renderer.shadowMap.needsUpdate = true
    }
    this.drawScene({
      scene: this.scene,
      camera: this.camera,
      surface: 'pane',
      paneIndex: 0,
      cameraNodeId: null,
      target: null,
      rect: null,
      width: Math.round(renderer.domElement.clientWidth * ratio),
      height: Math.round(renderer.domElement.clientHeight * ratio),
    })
  }

  /** Whether the preview leaves nothing of the panes to see — its grown state, in practice. */
  protected insetCoversAll(): boolean {
    return this.inset?.full === true
  }

  /**
   * The camera preview, drawn over the panes in its own scissored rectangle.
   *
   * A pass rather than a fifth pane, and rather than a second context: it covers what is already
   * drawn instead of dividing the surface, and a context per preview is what `scene-stage` pays
   * elsewhere and says why.
   */
  protected renderInset(renderer: WebGLRenderer, panesDrawn: boolean): void {
    const inset = this.inset
    if (!inset) return

    const ratio = renderer.getPixelRatio()
    const width = Math.max(1, Math.round(inset.rect.width * ratio))
    const height = Math.max(1, Math.round(inset.rect.height * ratio))
    const target = this.insetTargetOf(renderer, width, height)

    const now = performance.now()
    if (this.insetStale && now - this.insetDrawnAt >= INSET_CADENCE_MS) {
      this.drawInset(renderer, inset, target, panesDrawn)
      this.insetStale = false
      this.insetDrawnAt = now
    } else if (this.insetStale) {
      this.catchUpInset(now)
    }

    this.compositeInset(renderer, inset)
  }
}

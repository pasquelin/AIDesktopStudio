import { MeshBasicMaterial, NoToneMapping } from 'three'
import { oweShadowPassOnce } from '../scene/shadows'
import type { StudioRenderer } from '../render/renderDriver'
import { createGpuPipeline } from '../gpu/gpuPipeline'
import { frameDelta } from './frameClock'
import { recordFrame } from './gpuStats'
import { MAX_DELTA, INSET_CADENCE_MS } from './viewportEngineSupport1'
import type { InsetBlit } from './viewportEngineSupport1'
import { ViewportInset } from './ViewportInset'

export class ViewportFrame extends ViewportInset {
  /**
   * The quad that composites the preview, and the material it wears.
   *
   * `GpuPipeline` is the studio's own full-frame quad — the same one every image filter draws
   * through — rather than a second scene and camera written here.
   */
  protected insetBlitOf(renderer: StudioRenderer): InsetBlit {
    if (this.insetBlit) return this.insetBlit

    this.insetBlit = {
      quad: createGpuPipeline(renderer),
      // Applied on the way OUT and never inside the target: three skips tone mapping for anything
      // but the canvas (`WebGLPrograms`, `currentRenderTarget === null`), so the quad is where the
      // preview meets the same curve the panes do.
      material: new MeshBasicMaterial({
        depthTest: false,
        depthWrite: false,
        toneMapped: renderer.toneMapping !== NoToneMapping,
      }),
    }
    return this.insetBlit
  }

  /**
   * Wakes the loop once the cap has run out, so a change held back is never the last word.
   *
   * Without it a preview whose content moved on the very frame the loop went to sleep would keep
   * showing the instant before, until something else asked for a frame.
   */
  protected catchUpInset(now: number): void {
    if (this.insetCatchUp !== null) return
    this.insetCatchUp = setTimeout(
      () => {
        this.insetCatchUp = null
        this.requestRender()
      },
      Math.max(0, INSET_CADENCE_MS - (now - this.insetDrawnAt)),
    )
  }

  /**
   * The whole draw inside one query, and only while somebody is reading the figure — a query per
   * frame is a synchronous round trip to the driver, paid by every viewport that mounts one.
   *
   * `begin` early-returns while a query is open, so a frame that threw would leave its own for
   * the NEXT one to close, timing two frames as if they were one. Hence the `finally`.
   */
  private drawTimedFrame(
    renderer: StudioRenderer,
    panesDrawn: boolean,
    refreshAllShadows: () => void,
  ): boolean {
    const timesGpu = this.gpuFramesWanted > 0
    if (timesGpu) {
      this.gpuFramesWanted -= 1
      this.gpuTimer?.begin()
    }
    try {
      try {
        if (panesDrawn) this.renderPanes(renderer, refreshAllShadows)
        this.renderInset(renderer, panesDrawn)
      } finally {
        refreshAllShadows()
      }
      this.renderOverlay(renderer)
    } finally {
      if (timesGpu) this.gpuTimer?.end()
    }
    return timesGpu
  }

  /**
   * Opens the frame's shadow pass and hands back the call that closes it — narrowed to the
   * lights that moved, and restored for whatever renders off screen afterwards.
   */
  private armShadowPass(renderer: StudioRenderer): () => void {
    const stale = this.shadowsStale
    oweShadowPassOnce(renderer, stale)
    this.shadowsStale = false
    let restore = stale ? this.options.onShadowFrame?.(this.allShadowsStale) : undefined
    this.allShadowsStale = false
    return () => {
      restore?.()
      restore = undefined
    }
  }

  /**
   * On demand, not on a permanent loop: a studio whose viewport burns a frame at rest heats the
   * machine for nothing. The loop keeps going only while something is actually moving.
   */
  protected readonly renderFrame = (): void => {
    this.frame = null
    const renderer = this.renderer
    // Not until the backend answers: a node renderer throws on `render()` before it does, and
    // the frames it would have drawn are dropped rather than queued — `settleRenderer` asks
    // for a fresh one once it can draw.
    if (!renderer || !this.rendererReady) return

    // The engine clears, not three.js — see `autoReset` at mount.
    renderer.info.reset()

    const now = performance.now()
    const delta = frameDelta({
      since: this.lastTime === null ? null : now - this.lastTime,
      cap: MAX_DELTA,
    })
    this.lastTime = now

    const moving = this.options.onFrame?.(delta) ?? false

    const settling = this.updateControls()
    const refreshAllShadows = this.armShadowPass(renderer)
    const panesDrawn = !this.insetCoversAll()
    const renderStarted = performance.now()
    const timedGpu = this.drawTimedFrame(renderer, panesDrawn, refreshAllShadows)
    recordFrame(renderer.info, this.stats, performance.now() - renderStarted)
    this.stats.gpuFrameMs = timedGpu ? (this.gpuTimer?.read() ?? null) : null
    oweShadowPassOnce(renderer, true)
    if (moving || settling) {
      this.requestCameraRender()
      return
    }
    this.lastTime = null
  }

  private updateControls(): boolean {
    let settling = this.controls?.enabled === true && this.controls.update()
    for (const pane of this.extras) {
      if (pane.controls?.enabled === true && pane.controls.update()) settling = true
    }
    return settling
  }

  private renderOverlay(renderer: StudioRenderer): void {
    const overlay = this.options.onOverlay
    // `ViewHelper` is declared against a `WebGLRenderer` and the Advanced engine draws no
    // overlay yet: skipped there rather than cast into a renderer three never typed it for.
    if (!overlay || !('capabilities' in renderer)) return
    renderer.autoClear = false
    try {
      overlay(renderer)
    } finally {
      renderer.autoClear = true
    }
  }
}

import { type Object3D, PerspectiveCamera, WebGLRenderTarget } from 'three'
import { isolating } from './isolation'
import { aspectLoan } from '../viewport/aspectLoan'
import { type ViewportCamera } from '../viewport/ViewportEngine'
import { type Us } from '@shared/domain/time'
import { evenSize, frameTimes, type FilmRequest } from './film'
import { encodeFilmFrameOffThread } from './filmEncodePort'
import './bvhPatches'
import { SceneRendererPreview } from './SceneRendererPreview'
import { readRenderPixels } from './readRenderPixels'
export abstract class SceneRendererFilm extends SceneRendererPreview {
  protected abstract applyVisibility(): void
  /**
   * Asks for a frame and says nothing about the preview: the workshop moved, not the scene.
   *
   * The other half of `redraw`, and named rather than left as a bare call so the two intents can
   * be told apart at a glance — and so the guard can be a plain "none anywhere else" instead of a
   * list of exemptions that would go stale. What belongs here is what `hideWorkshop` hides: the
   * gizmo, the helpers, the grid. Nothing a camera of the scene can film.
   */
  protected repaint(): void {
    this.viewport.requestCameraRender()
  }
  /** The camera a node id stands for, or `null` when nothing in the scene answers to it. */
  protected cameraObject(cameraNodeId: string | null): PerspectiveCamera | null {
    const aimed = cameraNodeId ? this.objects.get(cameraNodeId) : null
    return aimed instanceof PerspectiveCamera ? aimed : null
  }
  /**
   * Hides everything the workshop draws for the person editing — light helpers, camera
   * frustums, skeletons, the grid, the rails, the transform gizmo — and hands back the call
   * that puts them all back.
   *
   * A render is the scene, not the tools it was built with. A directional light's helper is a
   * line drawn clean across the picture, and it was in every frame of both the film and the
   * montage. Only what was actually visible is restored: a helper already hidden by a setting
   * must not be turned on by a render passing through.
   *
   * An isolation is one of those tools, and it is put back the same way: what a camera films is
   * the scene, never the part of it somebody happened to be working on.
   */
  protected hideWorkshop(camera?: ViewportCamera): () => void {
    const hidden: Object3D[] = []
    const hide = (object: Object3D | null | undefined): void => {
      if (!object?.visible) return
      object.visible = false
      hidden.push(object)
    }
    // Before the hiding below: this shows nodes again, and a helper hidden after it stays hidden.
    const masked = isolating(this.isolation)
    if (masked) {
      for (const [id, node] of this.applied) {
        const object = this.objects.get(id)
        if (object) object.visible = node.visible
      }
    }
    // A studio VIEW borrows three's neutral room, and only `dressPane` gives it back — which a
    // film and a capture never go through, since they render the scene directly. Left alone, the
    // whole film comes out lit by the room instead of by the document's own sky.
    this.environment?.borrowStudio(false)
    // For the same reason, and it is the whole of what a zone has to be told. The preview names
    // ITS camera, and comes here on every frame it is shown: opening the zone in full for it put
    // the whole level back in the scene, twice a frame. A film and a capture name none, and every
    // cell is drawn for them.
    const zonedTo = this.zonedTo
    this.instances.follow?.(camera ?? null, this.shadowThrow)
    this.hideFurniture(hide)
    // Furniture too, but held by a material flag rather than a `visible`, so it is remembered
    // here rather than pushed onto `hidden`.
    const tinted = this.relief.showMaskTint?.(false) === true
    this.hideRails(hide)
    return () => {
      for (const object of hidden) object.visible = true
      if (tinted) this.relief.showMaskTint?.(true)
      if (masked) this.applyVisibility()
      // 🛑 The zone back where it was found. Left on the preview's own, the next pane widens it
      // again and answers « moved », which redraws every shadow map — every frame a preview is
      // shown, on a scene nothing touched.
      if (zonedTo) this.instances.follow?.(zonedTo, this.shadowThrow)
      this.zonedTo = zonedTo
    }
  }

  /** Everything a shot must not see, in one pass. Order does not matter: each hides on its own. */
  private hideFurniture(hide: (object: Object3D | null | undefined) => void): void {
    for (const helper of this.helpers.values()) hide(helper)
    for (const joints of this.joints.values()) hide(joints.points)
    for (const solids of this.boneSolids.values()) hide(solids.mesh)
    for (const frustum of this.frustums.values()) hide(frustum)
    // A body and a bulb are workshop furniture too: they stand where the thing they draw stands,
    // so a camera aimed at a lamp would otherwise film the bulb somebody drew to find it by.
    for (const marker of this.markers.values()) hide(marker)
    hide(this.grid)
    // Boxes, origins and normals, in one flag: they hang from a group of their own for this.
    hide(this.aids.object)
    // The arrows a person drags an object by. They stand where the object stands, so a camera
    // aimed at a selected node fills its preview — and its film — with the tool instead.
    hide(this.gizmo?.getHelper())
  }

  /**
   * A rail is a working aid like the grid, not something a shot puts on screen: drawn, its line
   * and its knobs would run across every previewed and every rendered frame.
   *
   * Apart from `hideFurniture` only to keep the order the relief tint was written in.
   */
  private hideRails(hide: (object: Object3D | null | undefined) => void): void {
    for (const node of this.applied.values()) {
      if (node.type === 'path') hide(this.objects.get(node.id))
    }
  }
  /** One frame of a film, off screen. Its own method only to keep `renderFilm` readable. */
  private drawFilmFrame(
    camera: ViewportCamera,
    cameraNodeId: string | null,
    target: WebGLRenderTarget,
    width: number,
    height: number,
  ): boolean {
    return this.viewport.drawScene({
      scene: this.viewport.scene,
      camera,
      surface: 'offscreen',
      paneIndex: 0,
      // Named for THIS frame: a shot hands the film to another camera mid-way, and the
      // composition that camera films through is the one to resolve.
      cameraNodeId,
      target,
      rect: null,
      width,
      height,
    })
  }

  /**
   * Draws the film one frame at a time, through whichever camera `cameraAt` names for that
   * instant, and hands each one over already encoded as a PNG.
   *
   * Off screen and at the film's own size, never the viewport's: what is being written has a
   * resolution of its own, and resizing the viewport to match would be visible on screen. The
   * helper the camera wears is hidden for the pass — a render is what the camera sees, not a
   * picture of the camera.
   *
   * `onFrame` is awaited between frames on purpose: it is what carries the bytes to the main
   * process, and running ahead of it would hold a whole film in memory.
   */
  async renderFilm(
    cameraAt: (time: Us) => string | null,
    request: FilmRequest,
    onFrame: (index: number, png: Uint8Array) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    const gl = this.viewport.gl
    const initialCamera = this.cameraObject(cameraAt(0))
    if (!gl || !initialCamera) throw new Error('no camera to render from')
    let camera = initialCamera
    const { width, height } = evenSize(request)
    const target = new WebGLRenderTarget(width, height)
    const restore = this.hideWorkshop()
    const loan = aspectLoan(width, height)
    const head = this.playhead
    try {
      let index = 0
      for (const time of frameTimes(request.duration, request.fps)) {
        if (signal?.aborted) return
        // Resolved per frame: a shot hands the film to another camera mid-way, and the frame
        // after a camera is deleted keeps the last one rather than throwing at the encoder.
        camera = this.cameraObject(cameraAt(time)) ?? camera
        loan.frame(camera)
        this.setPlayhead(time)
        const composed = this.drawFilmFrame(camera, cameraAt(time), target, width, height)
        const pixels = readRenderPixels(gl, target, width, height)
        index += 1
        await onFrame(index, await encodeFilmFrameOffThread(pixels, width, height, composed))
      }
    } finally {
      gl.setRenderTarget(null)
      target.dispose()
      this.post?.releaseSurface('offscreen')
      loan.restore()
      restore()
      // Where the head was before the film was asked for: a render is not an edit.
      this.setPlayhead(head)
      this.redraw()
    }
  }
}

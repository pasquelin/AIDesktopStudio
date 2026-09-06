import { Color, type Object3D, type PerspectiveCamera, Vector3 as ThreeVector3 } from 'three'
import { aspectLoan } from '../viewport/aspectLoan'
import { type ViewportCamera, type ViewportOutput } from '../viewport/ViewportEngine'
import { type Us } from '@shared/domain/time'
import { framingPlacement, plainVector, type CameraPlacement } from './sceneView'
import './bvhPatches'
import { lookedAtBy } from './sceneRendererSupport2'
import { boundsOf, isFramed } from './framedNodes'
import type { CameraPreviewRequest } from './sceneRendererSupport2'
import { SceneRendererSkinning } from './SceneRendererSkinning'

export abstract class SceneRendererPreview extends SceneRendererSkinning {
  protected abstract syncPaneFreeze(): void

  protected abstract repaint(): void

  protected abstract cameraObject(cameraNodeId: string | null): PerspectiveCamera | null

  protected abstract hideWorkshop(camera?: ViewportCamera): () => void

  /**
   * Readies this renderer to draw somewhere other than a screen, before it is mounted.
   *
   * Transparency is the point: a scene laid over a montage has to hand back the pixels it
   * painted and nothing behind them, or every clip under it would be hidden by a backdrop.
   */
  prepareOffscreen(output: ViewportOutput): void {
    this.transparent = output.alpha === true
    this.viewport.configureOutput(output)
  }

  /** Where the free camera stands and what it looks at, as plain numbers anything may hold. */
  viewPlacement(): CameraPlacement {
    const camera = this.viewport.perspective
    const pivot = this.viewport.orbit?.target
    // Brought back ONTO the line of sight: the pivot is where the pointer put it, off centre by
    // design, and every reader of this restores a placement by `lookAt` — a framing published
    // from an off-axis pivot comes back turned. A viewport with no controls has a gaze all the
    // same, and `lookAt(0, 0, 0)` would be a lie.
    const target = pivot
      ? lookedAtBy(camera, pivot)
      : camera.position.clone().add(camera.getWorldDirection(new ThreeVector3()))

    return { position: plainVector(camera.position), target: plainVector(target) }
  }

  /**
   * Where a running game puts the free camera. Moved directly rather than through the orbit, for
   * the reason `frameContents` gives — and asking for a frame through `repaint`, since what a
   * camera OF THE SCENE films has not changed.
   *
   * 🛑 It FREEZES the orbits, like a gizmo drag and a flight: damped, `OrbitControls` settles
   * towards a spherical state of its own for a dozen frames after a drag, so a camera written
   * every frame was eased back left by that residue. `releaseView` gives them back.
   *
   * 🛑 Its blind spot: the other three freeze for a GESTURE, this one for the whole game. In a quad
   * layout `armPaneUnderPointer` then returns early throughout, so the working pane sticks and a
   * pick runs against the camera of a pane one has left. A single view — every game window — is
   * untouched: nothing arms an orbit there anyway.
   */
  placeView(placement: CameraPlacement): void {
    const camera = this.viewport.perspective
    camera.position.set(placement.position.x, placement.position.y, placement.position.z)
    camera.lookAt(placement.target.x, placement.target.y, placement.target.z)
    this.viewport.orbit?.target.set(placement.target.x, placement.target.y, placement.target.z)
    this.drivenLens = placement.fieldOfView ?? null
    this.viewport.setFieldOfView(this.drivenLens ?? this.view.fieldOfView)
    // On the TRANSITION: this runs every frame of a game, for a value that changes twice a session.
    if (!this.viewDriven) {
      this.viewDriven = true
      this.syncPaneFreeze()
    }
    this.repaint()
  }

  /** Gives the camera back to the hand. What a STOP calls once it has put the framing back. */
  releaseView(): void {
    this.viewDriven = false
    this.drivenLens = null
    this.viewport.setFieldOfView(this.view.fieldOfView)
    this.syncPaneFreeze()
  }

  /** What a framing and a shadow frustum are both measured against — see `UNFRAMED_NODES`. */
  protected framedObjects(): Object3D[] {
    const objects: Object3D[] = []
    for (const [id, object] of this.objects) {
      if (isFramed(this.applied.get(id)?.type ?? 'group')) objects.push(object)
    }
    return objects
  }

  /**
   * Points the free camera at what the scene SHOWS, from a direction of the caller's choosing.
   *
   * Only the nodes that draw something are counted. A lamp stands where it lights FROM, ten
   * units up and to the side of what it lights: counted in the bounding box, a new scene's
   * three default lights make the box ten times the subject, and the subject lands small and
   * off in a corner. That is exactly what an automatic framing must not do.
   *
   * `from` is a direction, never a position — the studio's three-quarter view when nothing is
   * asked for. It is what a montage hands the ANGLE of the 3D tab's own camera through: a
   * working view sits well back, with room around the subject to see the grid, and taken whole
   * it would hand the montage a character a few pixels tall. The angle is a decision somebody
   * made; the distance is this function's, always.
   *
   * The camera is moved directly rather than through the orbit: a viewport drawing into a video
   * frame has no one dragging it, and the orbit's target would only be read on the next drag.
   * It asks for no render of its own, unlike `frameSelection`: its caller draws the very next
   * line, and a frame loop woken per aim would run the viewport's pass forever behind a canvas
   * nobody is looking at.
   *
   * Answers whether it actually framed SOMETHING — false while every model is still a node with
   * no file behind it, which encloses no box at all. That is what lets a caller aim once and
   * stop: re-aiming per frame makes the camera chase a walking character's own bounding box,
   * and the picture breathes with every step.
   */
  frameContents(from?: CameraPlacement): boolean {
    const objects = this.framedObjects()
    const bounds = boundsOf(objects)
    // Empty means the files have not landed: `framingPlacement` would fall back to averaging
    // the placements of empty groups, which is a framing of nothing dressed up as one.
    if (bounds.isEmpty()) return false

    const direction = from
      ? new ThreeVector3(
          from.position.x - from.target.x,
          from.position.y - from.target.y,
          from.position.z - from.target.z,
        )
      : undefined

    const { target, position } = framingPlacement(objects, this.view.fieldOfView, direction)
    const camera = this.viewport.perspective
    camera.position.copy(position)
    camera.lookAt(target)
    this.viewport.orbit?.target.copy(target)
    return true
  }

  /**
   * Draws ONE frame, now, through a camera of the scene, and hands back the canvas it landed on.
   *
   * Straight onto the drawing buffer rather than through a render target: the caller wraps that
   * canvas in a `VideoFrame` on the very next line, and a read back through the CPU would cost
   * eight megabytes a frame for pixels the GPU already holds. It follows that the frame must be
   * taken before this task yields — which is what `scene-sink` promises.
   *
   * `null` before the viewport is mounted, which is the whole of what can go wrong here.
   */
  drawFrom(cameraNodeId: string | null, time: Us): HTMLCanvasElement | null {
    const gl = this.viewport.gl
    const canvas = this.viewport.canvas
    if (!gl || !canvas) return null

    const camera = this.cameraObject(cameraNodeId) ?? this.viewport.perspective

    this.setPlayhead(time)

    const restore = this.hideWorkshop()
    const loan = aspectLoan(canvas.width, canvas.height)
    loan.frame(camera)

    try {
      gl.setRenderTarget(null)
      gl.render(this.viewport.scene, camera)
    } finally {
      loan.restore()
      restore()
    }
    return canvas
  }

  /**
   * Shows what a camera of the scene films, in a corner of the viewport. `null` closes it.
   *
   * The rectangle is the caller's because the frame drawn around the preview is DOM: two
   * rectangles that agree until one of them drifts would be a border sitting beside its picture.
   * `full` is told for the same reason — the rect is the INSIDE of that frame, so it never
   * measures as covering the canvas even when it does.
   */
  setCameraPreview(preview: CameraPreviewRequest | null): void {
    const camera = this.cameraObject(preview?.cameraNodeId ?? null)
    if (!camera || !preview) {
      this.post?.releaseSurface('inset')
      return this.viewport.setInsetPane(null)
    }

    // The viewport's own colour, never a panel one: what this shows is a RENDER, and a preview
    // painted on studio chrome would promise a film nobody is going to get.
    const backdrop = new Color(this.viewport.paletteToken('--color-viewport'))
    this.viewport.setInsetPane({
      camera,
      cameraNodeId: preview.cameraNodeId,
      rect: preview.rect,
      backdrop,
      full: preview.full,
    })
  }

  /**
   * Asks for a frame, and says that what the camera preview shows has moved with it.
   *
   * The ONE way this engine asks for a frame, and a guard holds it to that
   * (`SceneRenderer.redraws-the-preview.test.ts`). Everything here changes the scene, the pose or
   * the lens — which is exactly what a preview is a picture of — so the two travel together.
   * What must NOT come through here is the viewport's own camera: orbiting, flying and settling
   * ask for frames straight from `ViewportEngine`, and those frames reuse the picture rather
   * than walking the scene a second time.
   */
  protected redraw(): void {
    this.viewport.invalidateInset()
    this.viewport.requestRender()
  }
}

import { type OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { inRect, intoGlRect, paneAt, paneCount, type PaneLayout, type PaneRect } from './panes'
import { type PointerPosition } from './pointer'
import { frustumHeight } from './screenScale'
import { ownsGestures, cameraOf } from './viewportEngineSupport1'
import type { ViewportCamera, InsetPane, ExtraPane } from './viewportEngineSupport1'
import { ViewportState } from './ViewportState'

export abstract class ViewportPaneLayout extends ViewportState {
  protected abstract disposeExtra(): void

  protected abstract createExtra(): ExtraPane

  protected abstract layOutPanes(): PaneRect

  public abstract readonly requestRender: () => void

  public abstract invalidateInset(): void

  /**
   * The orthographic frustum, taken from the perspective one it stands in for: as tall at the
   * orbit target as the field of view makes it at that distance.
   */
  protected fitProjection(): void {
    // The main camera's own pane, which is the whole canvas until a quad layout says otherwise.
    const main = this.rects[0]
    const aspect = main && main.height > 0 ? main.width / main.height : 1

    // Read off the camera that is drawing: while the perspective one is active, the other's
    // placement is one swap out of date, and a resize would size the frustum from where the
    // view used to be.
    const camera = this.camera
    const target = this.controls?.target
    const distance = target ? camera.position.distanceTo(target) : camera.position.length()
    const height = frustumHeight(this.perspective.fov, distance)
    const width = height * aspect

    this.orthographic.top = height / 2
    this.orthographic.bottom = -height / 2
    this.orthographic.right = width / 2
    this.orthographic.left = -width / 2
    this.orthographic.updateProjectionMatrix()
  }

  /**
   * How the surface is divided. `quad` adds three orthographic views around the one that was
   * already there; `single` takes them away and gives the whole canvas back.
   *
   * The extra views arrive unaimed on purpose: where each one stands is a question about the
   * scene, and this module knows nothing about scenes. Whoever asks for four places them.
   */
  setLayout(layout: PaneLayout): void {
    if (layout === this.layout) return
    this.layout = layout

    if (layout === 'single') this.active = 0
    const wanted = paneCount(layout) - 1
    while (this.extras.length > wanted) this.disposeExtra()
    while (this.extras.length < wanted) this.extras.push(this.createExtra())

    this.layOutPanes()
    this.requestRender()
  }

  /**
   * How much world the added views take in. The scene editor sizes it to what the scene holds:
   * a fixed frustum shows a hand-sized model as a dot and a building as a corner of a wall.
   */
  setPaneHeight(height: number): void {
    if (height <= 0 || height === this.extraHeight) return
    this.extraHeight = height
    this.layOutPanes()
    this.requestRender()
  }

  get paneLayout(): PaneLayout {
    return this.layout
  }

  /** Every camera that draws, main one first. What a caller aims, and what a picker picks with. */
  get paneCameras(): readonly ViewportCamera[] {
    return [this.camera, ...this.extras.map(pane => cameraOf(pane))]
  }

  /** The orbit of each pane, main one first — `null` where a viewport was built without controls. */
  get paneOrbits(): readonly (OrbitControls | null)[] {
    return [this.controls, ...this.extras.map(pane => pane.controls)]
  }

  /** Pane 0 is the main camera; the rest read one past their own index. */
  protected cameraOfPane(index: number): ViewportCamera | null {
    const pane = this.extras[index - 1]
    return index === 0 ? this.camera : pane ? cameraOf(pane) : null
  }

  /**
   * The pane the pointer was last over. What a command acts on: pressing a display key means
   * "this view", the way every modelling package reads it — the pointer says which one.
   */
  get activePane(): number {
    return this.active
  }

  /**
   * Takes the views out of the pointer's hands for the length of another gesture — a gizmo handle
   * held, a camera flying — and gives them back.
   *
   * EVERY orbit, and the active pane with them: `armPaneUnderPointer` re-arms on every move, so a
   * caller that turned one orbit off itself would find it back on at the next pixel of that very
   * drag — the scene orbited under a handle being pulled. Frozen, the working view cannot change
   * mid-drag either, which is what stops a pointer straying into a neighbouring pane from handing
   * the gizmo another camera halfway through.
   */
  freezePanes(frozen: boolean): void {
    // On the TRANSITION, never on every call: this is read back on each pointer move, and
    // `paneAtPointer` measures the canvas — a second reflow per move for an answer already known.
    const thawing = this.frozen && !frozen
    this.frozen = frozen
    // Thawing re-arms from where the pointer IS: the move that lifts a freeze is the very one
    // `armPaneUnderPointer` returned early on, so reading `active` alone leaves the working view
    // — and the camera a gizmo grabs from — one event behind. `null` off the surface.
    if (thawing) this.active = this.paneAtPointer(this.lastPointer) ?? this.active

    this.armOrbits(frozen ? null : this.active)
  }

  /**
   * Hands the navigation to one pane and takes it from every other. `null` leaves all of them
   * off, which is both a frozen viewport and a pointer that has left the surface.
   *
   * `OrbitControls.enabled` is NOT that flag: it says whether the control still owns the
   * gestures, which it does on an orthographic pane only. It calls `update()` from its own move
   * handlers, so refusing it the pointer is the one way to stop it re-aiming at its target.
   */
  protected armOrbits(owner: number | null): void {
    // A single layout keeps `active` at 0, so the main orbit reads the same test as the others.
    this.armedPane = owner
    if (this.controls) this.controls.enabled = owner === 0 && ownsGestures(this.controls)
    for (const [index, pane] of this.extras.entries()) {
      if (pane.controls) pane.controls.enabled = owner === index + 1 && ownsGestures(pane.controls)
    }
  }

  /**
   * Where the active pane sits, in the frame a control that reads raw pointer events needs: CSS
   * pixels, origin bottom-left. `null` in a single layout, where the pane IS the canvas.
   */
  activePaneRegion(): PaneRect | null {
    const canvas = this.renderer?.domElement
    const rect = this.rects[this.active]
    if (this.layout === 'single' || !canvas || !rect) return null

    // Into a rect of its own: a caller aiming a control reads this on every pointer move, and the
    // answer is four numbers. The reference is handed out, so nobody may hold on to it.
    return intoGlRect(rect, canvas.clientHeight, this.activeRegion)
  }

  /**
   * Where a pointer sits ON the canvas, in CSS pixels from its top-left corner — the frame a DOM
   * overlay laid over the same box measures in. `null` while there is no surface.
   */
  canvasPointOf(pointer: PointerPosition): { x: number; y: number } | null {
    const canvas = this.renderer?.domElement
    if (!canvas) return null

    const bounds = canvas.getBoundingClientRect()
    return { x: pointer.clientX - bounds.left, y: pointer.clientY - bounds.top }
  }

  /** Which pane a pointer is over, or `null` when it is off the surface entirely. */
  paneAtPointer(pointer: PointerPosition): number | null {
    const at = this.canvasPointOf(pointer)
    if (!at) return null

    // The inset first, and it answers for nobody: it covers a pane rather than dividing the
    // surface, so without this a drag inside the preview would orbit the view underneath it.
    if (this.insetHasPointer(pointer)) return null
    return paneAt(this.rects, at.x, at.y)
  }

  /**
   * Whether a pointer landed in the camera preview. What a picker asks before casting a ray: the
   * preview draws through a camera of its own, so a ray cast from the pane underneath would meet
   * whatever stands behind the picture rather than what is in it.
   */
  insetHasPointer(pointer: PointerPosition): boolean {
    const inset = this.inset
    if (!inset) return false

    const at = this.canvasPointOf(pointer)
    return at !== null && inRect(inset.rect, at.x, at.y)
  }

  /**
   * What the preview shows, and where — `null` closes it.
   *
   * The rect comes from the caller because the DOM chrome around the preview has to land on the
   * very same pixels: one rectangle, decided once, rather than two that agree until they drift.
   */
  setInsetPane(pane: InsetPane | null): void {
    this.inset = pane
    this.invalidateInset()
    this.requestRender()
  }
}

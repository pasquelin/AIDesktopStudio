import { Box3, type AnimationClip, type Object3D, Vector3 as ThreeVector3 } from 'three'
import { type ExportFormat } from '@shared/domain/scene'
import { type ViewportCamera } from '../viewport/ViewportEngine'
import './bvhPatches'
import { exportObjects } from './sceneExport'
import { SIDE_VIEW_HEIGHT, SIDE_VIEW_MARGIN } from './sceneRendererSupport2'
import { SceneRendererGrouping } from './SceneRendererGrouping'

export abstract class SceneRendererExport extends SceneRendererGrouping {
  protected abstract repaint(): void

  protected abstract hasExportedAncestor(id: string, wanted: ReadonlySet<string>): boolean

  protected abstract asDocumented<T>(run: () => T): T

  protected abstract bakedClips(copies: readonly Object3D[]): AnimationClip[]

  protected abstract needsEdges(): boolean

  /**
   * Runs something that reads the tree DOWNWARD from these nodes, with the bodies their groups
   * draw for hung back under them for the length of the call.
   *
   * `Box3.setFromObject` and `BoxHelper` walk `children` and nothing else, so without this the box
   * of a group whose bodies are all drawn by one instance comes back EMPTY — a selection frame
   * left at the origin, a surface snap that does nothing, handles sized against a degenerate span.
   * Bounded by what is asked for rather than by the scene: the parents touched are these nodes.
   */
  protected withHungUnder<T>(ids: Iterable<string>, run: () => T): T {
    /** By PARENT, so hanging and dropping are each one pass over a `children` array, never one
     * per body — a floor of fifty thousand tiles makes that difference quadratic. */
    const added = new Map<Object3D, Set<Object3D>>()
    for (const id of this.descendantsOf(ids)) {
      const object = this.objects.get(id)
      const parent = object?.parent
      if (!object || !parent || !this.instances.holdsSource(object)) continue
      const mine = added.get(parent)
      if (mine) mine.add(object)
      else added.set(parent, new Set([object]))
    }

    for (const [parent, mine] of added) {
      // 🛑 MEMBERSHIP, never a proxy for it. A source is already in the walk while a pane shows
      // edges, and a drag carries one under the pivot through `Object3D.attach`, which pushes
      // whatever it is given. A second copy pushed here leaves WITH the first, and the body is
      // out of the walk for good — its matrix stops being composed, and the drag reports nothing.
      for (const child of parent.children) mine.delete(child)
      parent.children.push(...mine)
    }
    try {
      return run()
    } finally {
      for (const [parent, mine] of added) {
        if (mine.size > 0) parent.children = parent.children.filter(child => !mine.has(child))
      }
    }
  }

  protected readChildNodes(): void {
    this.childNodes.clear()
    for (const node of this.applied.values()) {
      if (!node.parentId) continue
      const kept = this.childNodes.get(node.parentId)
      if (kept) kept.push(node.id)
      else this.childNodes.set(node.parentId, [node.id])
    }
  }

  /** Which view the pointer is over — what a display command acts on. */
  activePane(): number {
    return this.viewport.activePane
  }

  /**
   * The camera one is working through: the view under the pointer, whichever it is.
   *
   * Only the AXIS of a side view is locked. Selecting, dragging a handle and framing are the
   * work itself, and a layout where three quarters can be looked at but not worked in is three
   * quarters of a viewport wasted.
   */
  protected cameraInHand(): ViewportCamera {
    return this.viewport.paneCameras[this.viewport.activePane] ?? this.viewport.camera
  }

  /**
   * Hands the gizmo to the view being worked in — its camera, and the rectangle that view fills.
   * Left untold, `TransformControls` reads its own pointer events against the WHOLE canvas, which
   * in a quad layout normalises a click against four times the surface it was aimed at.
   */
  protected aimGizmo(): void {
    const gizmo = this.gizmo
    if (!gizmo) return

    const camera = this.cameraInHand()
    if (gizmo.camera !== camera) {
      gizmo.camera = camera
      // The handles are SIZED in the camera they are aimed from, and a hover asks for no frame.
      this.repaint()
      // On the CHANGE alone: this walks whatever the gizmo holds, and it holds the object itself
      // rather than a pivot for a lone selection — 13.6 µs on an empty pivot against 2.7 ms on a
      // 20 000-node model, which per pointer move would be a third of a frame just to hover.
      this.refreshGizmoMatrices()
    }

    const region = this.viewport.activePaneRegion()
    gizmo.viewport = region
      ? this.gizmoRegion.set(region.x, region.y, region.width, region.height)
      : null
  }

  /**
   * `TransformControls` turns its drag PLANE in `updateMatrixWorld`, which only a RENDER calls —
   * and a hover asks for none, so the plane keeps the orientation of the view one quitted and comes
   * out parallel to the new ray: measured 19/08, ray·normal 0 in « De gauche », nothing moved.
   */
  protected refreshGizmoMatrices(): void {
    this.gizmo?.getHelper().updateMatrixWorld(true)
  }

  /**
   * How tall the side views have to see to hold what the scene holds, with room around it.
   *
   * The bounds of the objects rather than a constant: a character is two units tall and a set is
   * fifty, and one frustum for both shows one as a dot and the other as a corner.
   */
  protected sceneHeight(): number {
    const bounds = new Box3()
    for (const object of this.objects.values()) bounds.expandByObject(object)
    if (bounds.isEmpty()) return SIDE_VIEW_HEIGHT

    const size = bounds.getSize(new ThreeVector3())
    return Math.max(size.x, size.y, size.z, SIDE_VIEW_HEIGHT * 0.25) * SIDE_VIEW_MARGIN
  }

  quadView(): boolean {
    return this.viewport.paneLayout === 'quad'
  }

  /**
   * The scene as a file, or only what is selected.
   *
   * Roots only: what hangs from them comes along, and handing the exporter a child as well would
   * write it twice. The grid, the trihedron, the gizmo and the light helpers are siblings of the
   * nodes rather than children, so none of them is reachable from here.
   */
  exportTo(
    format: ExportFormat,
    scope: 'scene' | 'selection',
    /** What glTF has no place for, written on the scene — see `ExportOptions.extras`. */
    extras?: Record<string, unknown>,
  ): Promise<Uint8Array> {
    const wanted = new Set(scope === 'selection' ? this.selectedIds : this.objects.keys())
    const roots = [...wanted].filter(id => !this.hasExportedAncestor(id, wanted))
    // In DOCUMENT order, not in the order the objects were built: a node rebuilt after an undo
    // is the newest object of the map, and a file that listed it last diffed on every undo.
    const rank = new Map(this.documentOrder.map((node, at) => [node.id, at]))

    // The copies are taken synchronously inside `exportObjects`, so putting the document's own
    // visibility back for the length of this call is enough — an isolation running while somebody
    // exports must not write a file missing whatever they were not looking at.
    return this.asHung(() =>
      this.asDocumented(() =>
        exportObjects(
          roots.flatMap(id => this.objects.get(id) ?? []),
          format,
          {
            // The objects wear node ids, which is what picking reads back off a hit. A file wears
            // the names the document gave them.
            nameOf: id => this.applied.get(id)?.name,
            clipsFor: copies => this.bakedClips(copies),
            rankOf: id => rank.get(id),
            ...(extras && { extras }),
          },
        ),
      ),
    )
  }

  /**
   * Runs something against the scene as a TREE, with every body a group draws for back under the
   * node it hangs from: `Object3D.children` is what an exporter writes a parent's contents from,
   * and a source drawn by a group is held out of it — see `heldOutOfDraw`.
   */
  protected asHung<T>(run: () => T): T {
    this.instances.hangSources()
    try {
      return run()
    } finally {
      this.syncSourceWalk()
    }
  }

  /**
   * Whether the bodies a group draws for belong in the walk of the scene.
   *
   * They are what carries the EDGES: `applyWireOverlay` hangs a `LineSegments` under each mesh,
   * and a source out of the walk takes its outline with it. So the edge modes pay the traversal
   * the grouping exists to give back — 16.2 ms of scene pass against 0.29 on 50 000 bodies,
   * measured 02/09 — and every other mode does not.
   */
  protected syncSourceWalk(): void {
    if (this.needsEdges()) this.instances.hangSources()
    else this.instances.dropSources()
  }
}

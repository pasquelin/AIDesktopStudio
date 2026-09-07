import { type AnimationClip, type Object3D } from 'three'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'
import {
  type DrawRequest,
  type ProjectionKind,
  type ViewportCamera,
} from '../viewport/ViewportEngine'
import { stackDraws, type PostStack } from '@shared/domain/postProcessing'
import { tuneViewHelper } from './threeFactory'
import { drivenNodes } from './animationEval'
import { timelineClip, type ClipTarget } from './animationClips'
import { SECOND } from '@shared/domain/time'
import { dressForPane } from './paneDress'
import { applyWireOverlay, showsEdges } from './sceneView'
import { type DisplayMode } from '@shared/domain/scene'
import './bvhPatches'
import { playerPartsOf } from './playerModule'
import { SceneRendererExport } from './SceneRendererExport'

export abstract class SceneRendererDisplay extends SceneRendererExport {
  protected abstract redraw(): void

  protected abstract stackOf(request: DrawRequest): PostStack | null

  /**
   * The document's animation as a clip the file carries — baked, because glTF holds one absolute
   * value per node while a track here holds a delta several tracks add up.
   *
   * Read off the COPIES, which still wear node ids at this point: a clip bound to the objects on
   * screen would name nodes the file does not hold.
   */
  protected bakedClips(copies: readonly Object3D[]): AnimationClip[] {
    const targets: ClipTarget[] = []
    for (const nodeId of drivenNodes(this.timeline)) {
      const node = this.applied.get(nodeId)
      const object = copies.flatMap(root => root.getObjectByName(nodeId) ?? []).at(0)
      if (!node || !object) continue

      targets.push({
        nodeId,
        object,
        // A bone's rest is the one the FILE gave it, remembered the first time a track asked —
        // never the node's, which would move the whole rig by the node's own placement.
        restOf: bone => (bone ? (this.boneRests.get(`${nodeId}/${bone}`) ?? null) : node.transform),
      })
    }

    const clip = timelineClip(this.timeline, targets)
    return clip ? [clip] : []
  }

  /** A node whose parent is going out too travels with it, and must not be handed over twice. */
  protected hasExportedAncestor(id: string, wanted: ReadonlySet<string>): boolean {
    let parentId = this.applied.get(id)?.parentId
    while (parentId) {
      if (wanted.has(parentId)) return true
      parentId = this.applied.get(parentId)?.parentId
    }
    return false
  }

  setProjection(kind: ProjectionKind): void {
    this.viewport.setProjection(kind)
    // Rebuilt on the camera the viewport now draws with: a projection change swaps that camera
    // for another object entirely, and the trihedron is built around whichever one it was given.
    // Left alone it would show — and, since it became clickable, turn — a camera nothing renders.
    this.buildViewHelper()
    // The gizmo was handed a camera at mount and casts its grab ray from it. Left on the one
    // nothing draws, the ray starts where that camera was frozen: handles keep the screen size
    // they had, a drag off-centre grabs the neighbouring axis, and a miss falls through to the
    // orbit. Rebound rather than rebuilt — unlike the trihedron, its camera is assignable.
    if (this.gizmo) this.gizmo.camera = this.viewport.camera
  }

  /** The trihedron, on the viewport's current camera. Thrown away and remade rather than rebound:
   * the camera it holds is not part of its published surface. */
  protected buildViewHelper(): void {
    const canvas = this.viewport.canvas
    if (!canvas || this.options.chrome === false) return

    this.viewHelper?.dispose()
    const helper = new ViewHelper(this.viewport.camera, canvas)
    tuneViewHelper(helper)
    this.viewHelper = helper
    this.refreshWithoutShadows()
  }

  /**
   * Surfaces, edges, or both — one answer PER VIEW, main one first. Session state: nothing of
   * the document moves.
   *
   * The edges are built as soon as any view asks for them and hidden from the views that did
   * not: a `WireframeGeometry` per mesh is its own buffer, and building one set per pane would
   * cost the scene four times its geometry to show the same edges.
   */
  setDisplayModes(modes: readonly DisplayMode[], quads = this.quadEdges): void {
    const same =
      modes.length === this.displays.length &&
      modes.every((mode, index) => mode === this.displays[index])
    if (same && quads === this.quadEdges) return

    this.displays = [...modes]
    this.quadEdges = quads

    const anyEdges = modes.includes('both') || modes.includes('wireframe')
    for (const object of this.objects.values()) {
      applyWireOverlay(object, anyEdges, this.wireMaterial, quads)
    }
    // After the outlines are hung or dropped: whether the sources belong in the walk is exactly
    // whether they carry any.
    this.syncSourceWalk()
    this.redraw()
  }

  /** Whether any view is asking for edges at all — what decides if the geometry is built. */
  protected needsEdges(): boolean {
    return this.displays.some(mode => showsEdges(mode, this.quadEdges))
  }

  /** Everything a view dresses: the nodes it holds, and the instances that draw for them. */
  protected *dressable(): Generator<Object3D> {
    yield* this.objects.values()
    yield* this.instances.drawn()
  }

  /**
   * How THIS view shows the scene, set while its pass is about to run.
   *
   * A traversal per pane rather than `scene.overrideMaterial`: an override paints everything the
   * renderer draws, gizmo and grid included, and a manipulator drawn as a wireframe is a
   * manipulator nobody can grab. Only the document's own objects are walked — the gizmo, the
   * grid and the trihedron are siblings, never in `objects`.
   */
  protected dressPane(index: number, camera: ViewportCamera): boolean {
    // Only while it HOLDS something: three keeps the helper hidden with nothing attached, and
    // writing `true` here showed a gizmo no selection stood behind — it grabs nothing, so the
    // drag fell through to the orbit and turned the scene. A single layout keeps `active` at 0.
    if (this.gizmo?.object) {
      this.gizmo.getHelper().visible = index === this.viewport.activePane
    }

    // Before the dressing, and both answers kept: a cell that just came into the zone is a body
    // the shadow maps were drawn without.
    const zoned = this.instances.follow?.(camera, this.shadowThrow) ?? false
    this.zonedTo = camera

    const mode = this.displays[index] ?? this.displays[0] ?? 'shaded'
    const dressed = dressForPane(
      // The instances too: a display mode replaces a mesh's material, and one left out of this
      // walk goes on drawing shaded while everything around it wears the stand-in. Walked
      // LAZILY: `dressForPane` declines the work when the dress already holds, and an array
      // built here would be ten thousand copies per pane per frame on a still viewport.
      this.dressable(),
      mode,
      this.quadEdges,
      this.paneMaterials,
      this.paneMemory,
      camera,
      studio => this.environment?.borrowStudio(studio),
    )
    const body =
      this.options.chrome === false && this.world.play.camera === 'firstPerson'
        ? playerPartsOf(this.documentOrder)?.body
        : undefined
    this.firstPersonBody.sync(body ? this.objects.get(body.id) : undefined, signature =>
      this.retarget.profileOf(signature),
    )
    return dressed || zoned
  }

  /**
   * Holds the composition off for as long as the caller says, without touching the document.
   *
   * What the Before/After gesture presses. A render is NOT affected: an off-screen pass resolves
   * its own stack and never reads this — a comparison is a thing one looks at, not a thing one
   * writes out.
   */
  setPostBypassed(bypassed: boolean): void {
    if (bypassed === this.bypassed) return
    this.bypassed = bypassed
    this.refreshWithoutShadows()
  }

  /**
   * The composition one surface films through, at the instant it is being drawn.
   *
   * `false` when there is nothing to compose, and the viewport then draws straight — which is
   * what the ON/OFF switch, the bypass and a camera set to `disabled` all come down to. No target
   * is allocated and no chain compiled for a composition nobody asked to see.
   */
  protected compose(request: DrawRequest): boolean {
    const composer = this.post
    if (!composer) return false

    const stack = this.stackOf(request)
    if (!stackDraws(stack)) return false

    composer.draw({
      surface:
        request.surface === 'pane'
          ? (PANE_SURFACES[request.paneIndex] ?? 'pane:0')
          : request.surface,
      scene: request.scene,
      camera: request.camera,
      stack,
      target: request.target,
      rect: request.rect ?? undefined,
      width: request.width,
      height: request.height,
      // A render is never drawn at the cheap end: what is written out is what the quality
      // setting means at its top, whatever the viewport is set to.
      quality: request.surface === 'offscreen' ? 'high' : this.view.quality,
      toneMapped: this.world.toneMapping !== 'none',
      // The PLAYHEAD, not a wall clock: a film written twice has the same grain twice, and a
      // frame still shows grain because the head moves between them.
      time: this.playhead / SECOND,
    })
    return true
  }
}

const PANE_SURFACES = ['pane:0', 'pane:1', 'pane:2', 'pane:3']

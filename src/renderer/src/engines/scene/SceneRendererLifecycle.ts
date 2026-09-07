import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { onPaletteChange } from '../core/palette'
import { type SceneWorld } from '@shared/domain/scene'
import { springArmRigsOf } from './springArmRigs'
import type { Vector3 as TurnedVector } from '@shared/domain/transform'
import { createEnvironment } from '../viewport/environment'
import type { ViewportCamera } from '../viewport/viewportEngineSupport1'
import { type SceneNode, type SceneState } from './sceneState'
import { PostComposer } from '../postfx/PostComposer'
import { loadLutTexture } from '../postfx/lutSource'
import './bvhPatches'
import { STUDIO_INTENSITY } from './sceneRendererSupport1'
import { capsuleBodiesOf, NO_RIGS } from './sceneRendererSupport2'
import { shadowOfLightMoved, shadowOfNodeMoved } from './shadowChanges'
import type { RuntimeRenderArtifact } from './grouping'
import { runtimeOptimizationOf } from './runtimeWorldArtifacts'
import { SceneRendererResources } from './SceneRendererResources'
import { RuntimeTransformState, type RuntimePlacement } from './RuntimeTransformState'
export abstract class SceneRendererLifecycle extends SceneRendererResources {
  private readonly runtimeTransforms = new RuntimeTransformState()
  /** Read here because `apply` is the only step handed the state the compiler wrote it into. */
  protected runtimeArtifacts: readonly RuntimeRenderArtifact[] | undefined
  protected abstract canPlayheadMoveShadows(nodes: readonly SceneNode[]): boolean
  protected abstract readonly onPaletteChanged: () => void
  protected abstract applyPalette(): void
  protected abstract applyGround(): void
  protected abstract readonly onGizmoAxisChanged: () => void
  protected abstract readonly onDraggingChanged: () => void
  protected abstract readonly onGizmoChange: () => void
  protected abstract readonly onGizmoGrab: () => void
  protected abstract readonly onGizmoRelease: () => void
  protected abstract applySnap(): void
  protected abstract applyGizmoSize(): void
  protected abstract attachGizmo(): void
  protected abstract redraw(): void
  protected abstract applyEnvironment(wanted: SceneWorld): boolean
  protected abstract buildViewHelper(): void
  protected abstract readonly onPointerDown: (event: PointerEvent) => void
  protected abstract readonly onContextMenu: (event: Event) => void
  protected abstract readonly onPointerMove: (event: PointerEvent) => void
  protected abstract readonly onPointerUp: (event: PointerEvent) => void
  protected abstract readonly onPointerCancel: (event: PointerEvent) => void
  public abstract dispose(): void
  protected abstract sweepCompositions(state: SceneState): void
  protected abstract syncNode(node: SceneNode): void
  protected abstract release(id: string): void
  protected abstract hangFromParent(node: SceneNode): void
  protected abstract poseMarkers(nodes: readonly SceneNode[]): void
  protected abstract applyPoses(): void
  protected abstract tuneShadowsIfMoved(): void
  protected abstract applyCameraShots(): void
  protected abstract showAidsForSelection(): void
  protected abstract facingOf(id: string): TurnedVector | null
  protected abstract refreshAids(): void
  protected abstract applyWorld(wanted: SceneWorld): void
  protected abstract regroupInstances(): void
  protected abstract reportStats(): void
  mount(host: HTMLElement): void {
    this.viewport.mount(host)
    const canvas = this.viewport.canvas
    const camera = this.viewport.camera
    if (!canvas) return
    this.stopPaletteWatch = onPaletteChange(this.onPaletteChanged)
    this.applyPalette()
    this.addSceneFurniture()
    this.mountGizmo(camera, canvas)
    this.mountRenderer()
    this.buildViewHelper()
    this.hookInput(canvas)
  }

  private addSceneFurniture(): void {
    this.viewport.scene.add(this.pivot)
    // Beside the nodes, like the grid — but unlike the grid it stays in every film pass: it is
    // part of what the document IS, not of the workshop it is built in.
    this.viewport.scene.add(this.ground.object)
    this.viewport.scene.add(this.relief.object)
    this.viewport.scene.add(this.aids.object)
    this.applyGround()
  }

  private mountGizmo(camera: ViewportCamera, canvas: HTMLCanvasElement): void {
    const gizmo = new TransformControls(camera, canvas)
    // Since r169 the controls are not an Object3D; the helper is what goes into the scene.
    this.viewport.scene.add(gizmo.getHelper())
    // `onPointerDown` hovers and THEN grabs, so the axis is decided inside the very call that
    // uses the plane. This fires synchronously on that decision, which is the only moment left
    // to turn the plane before it is read.
    gizmo.addEventListener('axis-changed', this.onGizmoAxisChanged)
    gizmo.addEventListener('dragging-changed', this.onDraggingChanged)
    gizmo.addEventListener('objectChange', this.onGizmoChange)
    gizmo.addEventListener('mouseDown', this.onGizmoGrab)
    gizmo.addEventListener('mouseUp', this.onGizmoRelease)
    this.gizmo = gizmo
    // A gizmo is born on defaults, and the engine may already have been told otherwise — every
    // setter no-ops until this point, and `apply` has no reason to come round again.
    if (this.mode !== 'select') gizmo.setMode(this.mode)
    gizmo.setSpace(this.space)
    this.applySnap()
    this.applyGizmoSize()
    this.attachGizmo()
  }

  /** Nothing at all without a renderer: a viewport may be mounted before WebGL answers. */
  private mountRenderer(): void {
    // Lit before anything is added: a scene with no light of its own still shows its materials,
    // exactly as the texture viewport does. `apply` replaces this the moment a document says so.
    const renderer = this.viewport.gl
    if (!renderer) return
    this.post = new PostComposer(renderer, {
      loadLut: assetId => loadLutTexture(assetId, this.textureCache.versionOf(assetId)),
      lutStamp: assetId => this.textureCache.versionOf(assetId),
      // A grade that finished loading changes the picture, and nothing else would ask for the
      // frame that shows it: the loop is asleep by then.
      onReady: () => this.redraw(),
    })
    this.environment = createEnvironment(renderer, this.viewport.scene, () => this.redraw())
    this.environment.setStudio()
    // Half strength, unlike the texture preview: image-based light comes from everywhere and
    // is occluded by nothing, so at full intensity it fills the very shadows the lights cast.
    this.environment.setIntensity(STUDIO_INTENSITY)
    // A document applied before the viewport had a renderer lit none of this: it opened on the
    // procedural studio whatever sky it names. `SkyboxRenderer.mount` replays its own the same way.
    this.lit = null
    this.applyEnvironment(this.world)
  }

  private hookInput(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
  }
  unmount(): void {
    this.dispose()
  }
  /**
   * Syncs what changed and answers whether EVERY shadow map has to be drawn again. The lights
   * that alone moved are held instead, so a pass can be narrowed to them.
   */
  protected syncChangedNodes(nodes: readonly SceneNode[], allChanged: boolean): boolean {
    for (const node of nodes) {
      const previous = this.applied.get(node.id)
      if (previous === node) continue
      if (
        (previous?.type !== 'light' || node.type !== 'light') &&
        shadowOfNodeMoved(previous, node)
      )
        allChanged = true
      this.syncNode(node)
      if (
        !allChanged &&
        previous?.type === 'light' &&
        node.type === 'light' &&
        shadowOfLightMoved(previous, node)
      ) {
        allChanged = this.lightCarriesAnother(node.id)
      }
    }
    return allChanged
  }

  /**
   * A node hung UNDER a light has its shadow moved by it while nothing in the state says so; the
   * lamp's own glyph does not count. Rare enough to pay the whole pass for.
   */
  private lightCarriesAnother(id: string): boolean {
    const light = this.objects.get(id)
    if (!light) return false
    const glyph = this.markers.get(id)
    if (light.children.some(child => child !== glyph)) return true
    this.changedShadowLights.add(light)
    return false
  }

  apply(state: SceneState): void {
    this.runtimeTransforms.reset(state)
    this.applyState(state, null)
  }

  /** Applies only supported runtime poses; false leaves the renderer untouched for full apply. */
  applyRuntimeTransforms(placements: readonly RuntimePlacement[]): boolean {
    const delta = this.runtimeTransforms.prepare(placements, this.applied)
    if (!delta) return false
    if (delta.changed.length > 0) this.applyState(delta.state, delta.changed)
    return true
  }

  private applyState(state: SceneState, changed: readonly SceneNode[] | null): void {
    this.runtimeArtifacts = runtimeOptimizationOf(state)?.artifacts
    let allShadowsChanged = this.worldOrCountChanged(state)
    // Before the nodes, not after: whether a block travels is decided against what the band
    // already drives, and a model built in this very pass has to read the timeline that arrived
    // with it rather than the previous one.
    this.timeline = state.animation
    this.animations.setTimeline(state.animation)
    if (changed === null) this.sweepCompositions(state)
    this.documentOrder = state.nodes
    // The identity test sits HERE rather than only inside `syncNode`: on a pass where nothing
    // changed it is the whole of the work, and a call per node cost 4,6 ms on 50 000.
    allShadowsChanged = this.syncChangedNodes(changed ?? state.nodes, allShadowsChanged)
    this.releaseNodesThatLeft(state)
    this.rehangAndSelect(state)
    this.poseAndAim(state)
    this.applyWorld(state.world)
    this.attachGizmo()
    // Before the counters and after every placement: the instance matrices are copied from the
    // world matrices, which nothing past here moves.
    this.regroupInstances()
    this.playheadMovesShadows = this.canPlayheadMoveShadows(state.nodes)
    this.reportStats()
    if (allShadowsChanged) this.redraw()
    else if (this.changedShadowLights.size > 0) this.refreshChangedShadows()
    else this.refreshWithoutShadows()
  }

  /** What forces every shadow map rather than the ones a moved light touched. */
  private worldOrCountChanged(state: SceneState): boolean {
    return (
      state.animation !== this.timeline ||
      state.nodes.length !== this.applied.size ||
      state.world.ground !== this.world.ground ||
      state.world.layers !== this.world.layers ||
      state.world.environment !== this.world.environment
    )
  }

  /**
   * The set of live ids is built only when one can be missing. `applied` holds every node the
   * last pass knew, so it outgrows the state exactly when a node left it — and building that set
   * of 50 000 strings on every pass was most of what `apply` spent outside its sub-passes.
   */
  private releaseNodesThatLeft(state: SceneState): void {
    if (this.applied.size === state.nodes.length) return
    const alive = new Set<string>()
    for (const node of state.nodes) alive.add(node.id)
    let stale: string[] | null = null
    for (const id of this.objects.keys()) if (!alive.has(id)) (stale ??= []).push(id)
    if (stale) for (const id of stale) this.release(id)
  }

  private rehangAndSelect(state: SceneState): void {
    // A second pass, because the first cannot know the order: a child may be synced before the
    // parent it hangs from exists as an object. By here every one of them does. Walked only when
    // the content moved — walking all of them cost 9,7 ms on 50 000.
    if (this.hangAll) {
      for (const node of state.nodes) this.hangFromParent(node)
      this.hangAll = false
    }
    this.poseMarkers(state.nodes)
    this.selectedIds = state.selectedIds
    // The document's own answer on whether anything is left to follow: an emptied selection lets
    // the view go, where an object map caught mid-rebuild says nothing at all.
    if (state.selectedIds.length === 0) this.followed = null
  }

  private poseAndAim(state: SceneState): void {
    // After the transforms are written, never before: a pose is what the tracks ADD to the one
    // the node holds, so it has to be laid over a rest pose that is already up to date.
    // Unconditional: gating it on `state.animation !== this.timeline` would skip the pass after a
    // node was rebuilt under an unchanged timeline, and that node would stand in its rest pose.
    this.applyPoses()
    // After every node is placed and posed: the reach is measured off where things actually
    // stand, and a set that grew by one block re-cuts the frustum of every light at once.
    this.tuneShadowsIfMoved()
    this.applyCameraShots()
    this.showAidsForSelection()
    // 🛑 What the renderer reads off a COMPONENT, drawn rather than rendered: a walking body and
    // the arm a camera hangs on are volumes no geometry carries, and nothing else would show them.
    // 🛑 A window that PLAYS the scene draws neither, whatever the settings say — answering to no
    // setting, these two showed the player a cage around their own character.
    this.rigs =
      this.options.chrome === false
        ? NO_RIGS
        : {
            bodies: capsuleBodiesOf(state.nodes),
            arms: springArmRigsOf(state.nodes, id => this.facingOf(id)),
          }
    // After the transforms and the poses: a box is read off where an object actually stands.
    this.refreshAids()
  }
}

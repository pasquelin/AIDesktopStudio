import { wornMaterials } from '@shared/domain/scene'
import { carriesMaterial } from './sceneState'
import { rigStateOf } from './rigState'
import { instanceableOf, markInstanceable } from './instanceableModel'
import { release } from './pivot'
import './bvhPatches'
import { SceneRendererFlight } from './SceneRendererFlight'
export abstract class SceneRendererMaterials extends SceneRendererFlight {
  protected abstract dropMarquee(): void
  protected abstract readonly onPointerDown: (event: PointerEvent) => void
  protected abstract readonly onContextMenu: (event: Event) => void
  protected abstract readonly onPointerMove: (event: PointerEvent) => void
  protected abstract readonly onPointerUp: (event: PointerEvent) => void
  protected abstract readonly onPointerCancel: (event: PointerEvent) => void
  protected abstract readonly onGizmoAxisChanged: () => void
  protected abstract readonly onDraggingChanged: () => void
  protected abstract readonly onGizmoChange: () => void
  protected abstract readonly onGizmoGrab: () => void
  protected abstract readonly onGizmoRelease: () => void
  protected abstract release(id: string): void
  /**
   * Whether the camera owns the keyboard — a button held, the mode armed, or, under Roblox,
   * always. Which of the three is the preset's to say; `navigationPreset.test.ts` holds what
   * `always` costs, being the two scene commands whose key it would otherwise swallow.
   *
   * Public because a key can mean two things at once: ⇧A opens the Add menu and is also
   * boost-strafe-left, and the held set cannot tell them apart — Shift is down either way.
   */
  get flying(): boolean {
    if (this.scheme.fly === 'always') return true
    return this.flownWith !== null || this.navigating
  }
  /**
   * Whether a GESTURE holds the keys. What a command ambiguous with a direction has to read —
   * `flying` is unconditionally true under a permanent flight, and would disable it for good.
   */
  get flightHeld(): boolean {
    return this.flownWith !== null || this.navigating
  }
  /**
   * Whether the ARROWS are the camera's too. Only while a gesture holds the flight: a permanent
   * one would cancel them in the capture phase for the whole window, and every tree, menu and
   * slider of the studio navigates by arrow. The letters stay the camera's either way.
   */
  get flightOwnsArrows(): boolean {
    return this.flightHeld
  }
  dispose(): void {
    this.stopWhatRuns()
    this.unhookInput()
    this.dropGizmo()
    this.releaseSceneContents()
    this.disposeEngines()
    this.viewport.dispose()
  }

  private stopWhatRuns(): void {
    // A preview left running would keep posing a model whose caches this method is about to drop.
    cancelAnimationFrame(this.previewFrame)
    this.previewFrame = 0
    this.heldPreview = null
    this.stopPaletteWatch?.()
    this.stopPaletteWatch = null
    // Or the last drag's roots outlive every node they name.
    this.surfaceScope.length = 0
    this.setNavigating(false)
    // Or the frame it left pending publishes an outline into a host that has already gone.
    this.dropMarquee()
  }

  private unhookInput(): void {
    const canvas = this.viewport.canvas
    canvas?.removeEventListener('pointerdown', this.onPointerDown)
    canvas?.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    this.gizmo?.removeEventListener('axis-changed', this.onGizmoAxisChanged)
    this.gizmo?.removeEventListener('dragging-changed', this.onDraggingChanged)
    this.gizmo?.removeEventListener('objectChange', this.onGizmoChange)
    this.gizmo?.removeEventListener('mouseDown', this.onGizmoGrab)
    this.gizmo?.removeEventListener('mouseUp', this.onGizmoRelease)
  }

  private dropGizmo(): void {
    this.gizmo?.detach()
    this.gizmo?.dispose()
    this.gizmo = null
    release(this.pivot, this.viewport.scene)
    this.pivot.removeFromParent()
    this.viewHelper?.dispose()
    this.viewHelper = null
  }

  private releaseSceneContents(): void {
    for (const id of [...this.objects.keys()]) this.release(id)
    this.sky.release()
    this.environment?.dispose()
    this.environment = null
    this.animations.clear()
    for (const id of [...this.boneSolids.keys()]) this.unbindSkeleton(id)
  }

  /** In the order they were written: a pass disposed before what feeds it takes the target with it. */
  private disposeEngines(): void {
    this.post?.dispose()
    this.post = null
    this.textureCache.dispose()
    this.modelCache.dispose()
    this.csg.dispose()
    this.shapes.dispose()
    this.instances.dispose()
    this.gltf.dispose()
    this.wireMaterial.dispose()
    this.paneMaterials.dispose()
    this.bvh.dispose()
    this.skin.dispose()
    this.cancelRetargets()
    this.retarget.dispose()
    this.clipSources.dispose()
    this.bundled.clear()
    this.iks.clear()
    this.grid?.dispose()
    this.grid = null
    this.ground.dispose()
    this.relief.dispose()
    this.scatter.dispose()
    this.sun.dispose()
    this.aids.dispose()
  }
  /**
   * One model wearing what it should. Read from `applied` rather than taken as an argument: the
   * answer can arrive a query later, and the node may have moved on by then.
   */
  protected dressModel(nodeId: string): void {
    const maps = this.modelMaps.get(nodeId)
    const node = this.applied.get(nodeId)
    if (!maps || node?.type !== 'model') return
    const dress = node.model.dress ?? this.options.defaultModelDress?.(node.model.assetId)
    const first = dress ? (this.options.wornDress?.(dress, 0) ?? null) : null
    maps.fileTextures(first?.fileTextures !== false)
    // Every slot, always: a slot dropped from the list goes back to its own material. And one
    // pass for a model that carries NO material to write into — `apply` is what says so out loud,
    // and a loop bounded by zero never reaches it.
    const passes = dress ? Math.max(maps.count(), 1) : maps.count()
    for (let slot = 0; slot < passes; slot += 1) {
      const worn = dress ? (this.options.wornDress?.(dress, slot) ?? null) : null
      maps.apply(slot, worn?.textures ?? {})
      // After the maps, always: the tiling rides ON the textures — see `dress`.
      maps.dress(slot, worn?.material)
    }
    const holder = this.objects.get(nodeId)
    if (holder) {
      markInstanceable(
        holder,
        instanceableOf(node, rigStateOf(holder), this.animations.clipsOf(nodeId)),
      )
    }
  }
  /**
   * The catalogue moved: every slot asks again for what it holds, and reloads the ones whose
   * picture was overwritten since.
   *
   * Nothing at all when no version changed — a binding compares what it holds before it lets go —
   * so this may be called on every write to the shelf, which is exactly what it is for. Without
   * it a texture edited and saved stayed on screen as it was until the engine was rebuilt, since
   * the id a slot points at does not move when ⌘S rewrites the file behind it.
   */
  refreshTextures(): void {
    for (const [id, maps] of this.textures) {
      const node = this.applied.get(id)
      // A solid wears the same descriptor and registers the same slots — `carriesMaterial` is
      // what keeps the three in step, where a list of types drifts.
      if (node && carriesMaterial(node)) maps.apply(node.material)
    }
    for (const [id, maps] of this.spriteMaps) {
      const node = this.applied.get(id)
      if (node?.type === 'sprite') maps.apply(node.sprite)
    }
    this.dressModels()
    // The environment too: a skybox asset is a picture of the project like any other, and the
    // lighting it drives is what would otherwise stay on the image the edit replaced.
    void this.sky.refresh()
  }

  /** Drops the in-memory copies after the model file's embedded textures were extracted. */
  detachModelFileTextures(assetId: string): void {
    for (const [nodeId, maps] of this.modelMaps) {
      const node = this.applied.get(nodeId)
      if (node?.type !== 'model' || node.model.assetId !== assetId) continue
      maps.detachFileTextures()
      this.options.onMaterials?.(
        nodeId,
        maps.count(),
        maps.names(),
        maps.parts(),
        maps.hasFileTextures(),
        maps.sourceIndices(),
      )
    }
  }
  /**
   * The models wearing one of these material documents ask again for what their dress is worth —
   * every model when none is named. The push behind « edit the material and the model follows »:
   * the document a node names moved, and no id of this scene did.
   */
  dressModels(materialIds?: readonly string[]): void {
    const wanted = materialIds && new Set(materialIds)
    for (const id of this.modelMaps.keys()) {
      const node = this.applied.get(id)
      if (
        wanted &&
        !(node?.type === 'model' && wornMaterials(node.model.dress).some(one => wanted.has(one)))
      ) {
        continue
      }
      this.dressModel(id)
    }
  }
}

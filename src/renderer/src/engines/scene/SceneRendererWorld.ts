import { type SceneWorld } from '@shared/domain/scene'
import { applyFog, applyToneMapping } from './worldBinding'
import { type SceneNode } from './sceneState'
import './bvhPatches'
import { gizmoSizeFor, heldRadius, screenFactor } from './gizmoSize'
import { snapSteps } from './snapSteps'
import { STUDIO_INTENSITY } from './sceneRendererSupport1'
import { SceneRendererAids } from './SceneRendererAids'
import { reportFailure } from '@/services/diagnostics'

export abstract class SceneRendererWorld extends SceneRendererAids {
  protected abstract applyPalette(): void

  protected abstract syncNode(node: SceneNode): void

  protected abstract poseMarkers(nodes: readonly SceneNode[]): void

  /**
   * How much of the SCREEN the handles take. `TransformControls` divides the distance out of
   * their scale, so they never shrink with it — this is the share of the frame they keep, and
   * the default of 1 covered half the view.
   */
  protected applyGizmoSize(): void {
    const held = this.gizmo?.object
    if (!this.gizmo || !held) return

    held.updateMatrixWorld(true)
    this.withHungUnder(this.selectedIds, () => this.gizmoBox.setFromObject(held))
    // The MODE decides how far the outermost handle stands: a rotation ring reaches further than
    // an arrow, so the same size wraps two different radii.
    if (this.mode === 'select') return
    this.gizmo.size = gizmoSizeFor(
      this.view.gizmoSize,
      heldRadius(this.gizmoBox, this.gizmoSpan),
      screenFactor(
        this.viewport.camera,
        this.viewport.camera.getWorldPosition(this.gizmoEye),
        held.getWorldPosition(this.gizmoSpot),
      ),
      this.mode,
    )
  }

  protected applySnap(): void {
    const gizmo = this.gizmo
    if (!gizmo) return

    const steps = snapSteps(this.view, this.snapping)
    gizmo.setTranslationSnap(steps.translate)
    gizmo.setRotationSnap(steps.rotate)
    gizmo.setScaleSnap(steps.scale)
  }

  /**
   * The theme moved. The background, the grid and the axes are rebuilt from the new tokens, but
   * the meshes are not: their materials were built with the previous `--color-mesh`, and
   * `syncNode` compares by reference — every one of them would be skipped. Emptying what has
   * been applied is what makes them repaint, and it costs nothing outside this rare moment.
   */
  protected onPaletteChanged = (): void => {
    if (!this.viewport.canvas) return

    this.aidPaletteHeld = null
    this.applyPalette()
    // A ground with no colour of its own reads the palette like a mesh does, and `applyPalette`
    // does not reach it: it is not a node, so the loop below never walks it.
    this.applyGround()

    const nodes = [...this.applied.values()]
    this.applied.clear()
    for (const node of nodes) this.syncNode(node)
    this.poseMarkers(nodes)

    this.redraw()
  }

  /**
   * The half of a document that belongs to no node, pushed into three.js.
   *
   * Compared field by field rather than by reference: a command replaces the whole world object
   * for a one-field edit, and prefiltering an environment or rebuilding a ground on every apply
   * would cost a mip chain per keystroke.
   */
  protected applyWorld(wanted: SceneWorld): void {
    const held = this.world
    this.world = wanted

    this.applyEnvironment(wanted)

    if (wanted.fog !== held.fog) applyFog(this.viewport.scene, wanted.fog)

    const gl = this.viewport.gl
    if (gl && (wanted.toneMapping !== held.toneMapping || wanted.exposure !== held.exposure)) {
      applyToneMapping(gl, wanted.toneMapping, wanted.exposure)
    }

    if (wanted.ground !== held.ground || wanted.layers !== held.layers) this.applyGround()
    if (wanted.layers !== held.layers) {
      this.relief.holdGroundPaint?.(this.holdingGroundPaint())
      this.relief.sync(wanted)
      void this.syncScatter(wanted)
      this.noteReliefSculpt()
      this.noteGroundPaint()
    }
    if (this.relief.object.children.length > 0) this.ground.object.visible = false
    if (wanted.background !== held.background) this.paintBackground()
  }

  protected async syncScatter(wanted: SceneWorld): Promise<void> {
    try {
      await this.scatter.sync(wanted, this.relief.heightmaps())
    } catch (error) {
      reportFailure('scene.model', 'scatter', error)
    }
  }

  /**
   * What lights the scene: the sky it names, its sun, and the scene's own two dials OVER them.
   * Held by IDENTITY, which `environmentDressOf` makes stable — `lightAgain` fires on every edit
   * of every open sky, and a scene naming none of them must not pay a frame for the news.
   */
  protected applyEnvironment(wanted: SceneWorld): boolean {
    const environment = this.environment
    if (!environment) return false

    const dress = this.options.environmentDress?.(wanted.environment) ?? null
    const lit = this.lit
    if (
      lit &&
      lit.dress === dress &&
      lit.intensity === wanted.envIntensity &&
      lit.rotation === wanted.envRotation
    ) {
      return false
    }
    if (dress?.sun !== lit?.dress?.sun) this.sun.apply(dress?.sun ?? null)
    this.lit = { dress, intensity: wanted.envIntensity, rotation: wanted.envRotation }

    void this.sky.apply(environment, dress)

    // A MULTIPLIER over the studio's own strength, never the strength itself: the viewport has
    // always lit at `STUDIO_INTENSITY`, and a document opening at 1 would relight every scene
    // ever saved.
    environment.setIntensity(STUDIO_INTENSITY * wanted.envIntensity * (dress?.intensity ?? 1))
    environment.setRotation(wanted.envRotation)

    return true
  }

  /**
   * The sky it names says the scene is lit again. A pass that changed nothing asks for NO frame:
   * `redraw` marks the shadow maps stale, measured on this Mac at 0.7 to 2.7 ms.
   */
  lightAgain(): void {
    if (this.applyEnvironment(this.world)) this.redraw()
  }

  protected applyGround(): void {
    this.ground.apply(this.world.ground, this.viewport.paletteToken('--color-mesh'))
    this.redraw()
  }

  /**
   * What hangs behind the scene.
   *
   * A sky asked to light the scene without being SEEN is the case that makes this more than a
   * colour: the environment keeps prefiltering — the reflections stay — and only the picture
   * stops being drawn. That is what `setBackgroundVisible` is for, and why the choice is settled
   * here rather than by whoever loads the sky.
   */
  protected paintBackground(): void {
    const wanted = this.world.background
    // A scene drawn for compositing keeps nothing behind it: a backdrop would hide every clip
    // this one is laid over. It outranks the document — a montage never asked for a backdrop.
    const shows = !this.transparent && wanted.kind === 'environment'
    this.environment?.setBackgroundVisible(shows)
    // Only the picture carries it, so any other backdrop puts it back to sharp rather than
    // leaving the previous softening on the next sky that hangs there.
    this.environment?.setBackgroundBlur(wanted.kind === 'environment' ? wanted.blur : 0)

    if (shows && this.sky.showsSky()) return

    if (this.transparent || wanted.kind === 'transparent') {
      this.viewport.scene.background = null
      return
    }

    this.viewport.setBackgroundColor(
      wanted.kind === 'color' ? wanted.color : this.viewport.paletteToken('--color-viewport'),
    )
  }
}

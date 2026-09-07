import './bvhPatches'
import { forward, right, step } from './sceneRendererSupport2'
import { SceneRendererPicking } from './SceneRendererPicking'
export abstract class SceneRendererFrame extends SceneRendererPicking {
  /** Reports whether the camera is still flying, which is what keeps the loop alive. */
  protected advance(delta: number): boolean {
    const scatterChanged = this.scatter.updateVisibility(this.viewport.camera)
    // Before the panes are drawn and after everything that writes a pose — the head, a clip, a
    // gizmo on the handle: whatever moved, the chain reaches for where the target stands NOW.
    for (const chain of this.iks.values()) chain.update()
    // 🛑 Before the joints are read and after the chains: while a skeleton is being EDITED the
    // bones ARE the rest pose, so the skin follows them rather than being deformed by them. A
    // joint would otherwise drag the arm along with it for the whole of the gesture and snap
    // back only on release — see `restRig`.
    if (this.restEditing) this.restSkins()
    for (const solids of this.boneSolids.values()) {
      if (solids.mesh.visible) solids.refresh()
    }
    return this.advanceView(delta, scatterChanged)
  }

  protected advanceView(delta: number, scatterChanged: boolean): boolean {
    for (const joints of this.joints.values()) {
      if (joints.points.visible) joints.refresh()
    }
    this.applyGizmoSize()
    const followed = this.followSelection()
    const moving = this.flying && this.held.size > 0
    if (moving) {
      // Only under a button that armed it: a permanent flight killed every later left click.
      if (this.flownWith !== null) this.flew = true
      this.fly(delta)
    }
    return moving || followed || scatterChanged
  }
  protected fly(delta: number): void {
    const camera = this.viewport.camera
    const boost = this.held.has('boost') ? this.view.boostFactor : 1
    const speed = this.flySpeed * delta * boost
    camera.getWorldDirection(forward)
    right.crossVectors(forward, camera.up).normalize()
    step.set(0, 0, 0)
    if (this.held.has('forward')) step.add(forward)
    if (this.held.has('back')) step.sub(forward)
    if (this.held.has('right')) step.add(right)
    if (this.held.has('left')) step.sub(right)
    if (this.held.has('up')) step.y += 1
    if (this.held.has('down')) step.y -= 1
    if (step.lengthSq() === 0) return
    step.normalize().multiplyScalar(speed)
    camera.position.add(step)
    this.viewport.orbit?.target.add(step)
  }
}

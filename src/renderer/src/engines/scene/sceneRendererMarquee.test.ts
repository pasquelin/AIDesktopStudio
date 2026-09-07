import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

const handler = (name: string, args: string): string =>
  source.match(new RegExp(`${name} = \\(${args}\\): void => \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''
const method = (signature: string): string =>
  source.match(new RegExp(`protected ${signature} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''
const privateMethod = (signature: string): string =>
  source.match(new RegExp(`private ${signature} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''
const pointerDown = handler('onPointerDown', 'event: PointerEvent')
const pointerUp = handler('onPointerUp', 'event: PointerEvent')
const leftUp = privateMethod('endLeftButton\\(event: PointerEvent\\): void')
const pointerMove = handler('onPointerMove', 'event: PointerEvent')
const armMarquee = method('armMarquee\\(event: PointerEvent\\): void')
const pickInMarquee = method('pickInMarquee\\(marquee: Marquee, event: PointerEvent\\): void')
const screenBodies = method('screenBodies\\(camera: Camera\\): ScreenBody\\[\\]')

/**
 * The rectangle a bare left button drags, and what it must not take from the gestures already on
 * that button.
 *
 * Read as text for the reason `sceneRendererFlight.test.ts` gives: the engine cannot be built
 * without a WebGL context, so its pointer paths have no other witness. What the rectangle TAKES
 * is arithmetic, and measured for real in `marqueeSelection.test.ts`.
 */
describe('SceneRenderer and the rectangle', () => {
  // A regex that matched nothing would make every assertion below vacuously true.
  it('finds the seven paths the rest of this file reads', () => {
    expect(
      [pointerDown, pointerUp, leftUp, pointerMove, armMarquee, pickInMarquee, screenBodies].map(
        found => found.length > 0,
      ),
    ).toEqual([true, true, true, true, true, true, true])
  })

  /** Under `custom` the bare left button may still orbit, and under Blender the middle one does. */
  it('arms nothing on a press the scheme has already spent', () => {
    expect(armMarquee).toContain('gestureOf(event, this.scheme) !== null')
  })

  /** One finger TURNS the view — a rectangle under it would take every tap-and-drag. */
  it('arms nothing on a finger', () => {
    expect(armMarquee).toContain("event.pointerType === 'touch'")
  })

  /** `paneAtPointer` answers for nobody over the preview, which is drawn through another camera. */
  it('arms nothing off the panes, the preview included', () => {
    expect(armMarquee).toContain('this.viewport.paneAtPointer(event)')
    expect(armMarquee).toContain('pane === null')
  })

  /**
   * `TransformControls` grabs its handle on the very press that armed this, from a listener of
   * its own — so the first move is where a handle can still be told from a sweep.
   */
  it('gives the rectangle up the moment a handle takes the drag', () => {
    expect(pointerMove).toContain('this.gizmo?.dragging')
    expect(pointerMove).toContain('this.dropMarquee()')
  })

  /** A release swallowed by a native menu never reaches this side — `buttons` is what tells. */
  it('gives it up on a button that is no longer down', () => {
    expect(pointerMove).toContain('(event.buttons & maskOf(0)) === 0')
  })
})

describe('SceneRenderer rectangle selection', () => {
  it('picks what the rectangle crossed on release, and only once it travelled', () => {
    expect(leftUp).toContain('!wasClick(marquee.from, marquee.to)')
    expect(leftUp).toContain('this.pickInMarquee(marquee, event)')
  })

  /**
   * Before the click path, and returning: a sweep that crossed nothing CLEARS the selection,
   * where falling through to `wasClick` would have left it standing.
   */
  it('leaves the click path to a press that never travelled', () => {
    expect(leftUp.indexOf('this.pickInMarquee(')).toBeLessThan(
      leftUp.indexOf('if (flew || !wasClick('),
    )
  })

  it('measures against the camera of the pane it was DRAWN in, wherever the hand ended', () => {
    expect(pickInMarquee).toContain('this.viewport.pointerNdcOf(marquee.from, marquee.pane)')
    expect(pickInMarquee).toContain('this.viewport.paneCameras[marquee.pane]')
  })

  /** A bone is not a node, and in pose mode a click already names one rather than the other. */
  it('names a bone in pose mode and never a node', () => {
    const pose = pickInMarquee.slice(pickInMarquee.indexOf('if (this.poseMode)'))

    expect(pose).toContain('this.options.onSelectBone?.(')
    expect(pose.indexOf('return')).toBeLessThan(pose.indexOf('this.options.onSelect('))
  })

  /**
   * A rectangle ADDS under the modifiers where a click toggles: dragged twice over the same body,
   * a toggle would take back what the first sweep gave.
   */
  it('adds to the selection under the extending keys rather than toggling it', () => {
    expect(pickInMarquee).toContain('extendsSelection(event) ? this.selectedIds : []')
  })

  /** Alt+right dollies under three of the six, and a flight there freezes the panes under it. */
  it('leaves the right button to the scheme before arming a flight with it', () => {
    expect(pointerDown).toContain(
      'if (gestureOf(event, this.scheme) === null) this.startFlight(event)',
    )
  })

  /**
   * The node menu is the one gesture left to the right button, and it is read off `flownFrom`.
   * Left unset for a press the scheme claimed, Alt+right-click opened nothing at all.
   */
  it('remembers a claimed right press all the same, the menu reading a click off it', () => {
    expect(pointerDown).toContain('this.flownFrom = { clientX: event.clientX')
  })

  /** One radius read for both axes missed the top third of every body on a pane wider than tall. */
  it('measures a body on both axes of the device frame', () => {
    expect(screenBodies).toContain('BODY_UP.setFromMatrixColumn(camera.matrixWorld, 1)')
    expect(screenBodies).toContain('Math.abs(BODY_ABOVE.y - BODY_CENTRE.y)')
  })

  /**
   * `object.visible` is written per node, so a hidden GROUP leaves its children's flag standing.
   * Read on the node alone, the rectangle took what a hidden group held — while a click walked
   * the chain and could not. The two answer the same question, so both walk it.
   */
  it('skips a body whose ancestor is the one that was hidden', () => {
    expect(screenBodies).toContain('shownInWorld(object)')
    expect(source).toContain('for (let node: Object3D | null = object; node; node = node.parent)')
  })
})

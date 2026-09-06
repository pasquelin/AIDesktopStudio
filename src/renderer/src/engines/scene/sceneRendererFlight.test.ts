import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * Which buttons arm the flight, and what arming it must not cost them.
 *
 * Read as text for the reason `sceneRendererRedraw.test.ts` gives: the engine cannot be built
 * without a WebGL context, so its pointer paths have no other witness. What matters here is that
 * the left button KEEPS what it already did — orbiting through `OrbitControls`, picking on
 * release, driving the gizmos — and only gains the keys the right one already answered.
 */
const handler = (name: string, args: string): string =>
  source.match(new RegExp(`${name} = \\(${args}\\): void => \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''

const pointerDown = handler('onPointerDown', 'event: PointerEvent')
const pointerUp = handler('onPointerUp', 'event: PointerEvent')
const endFlight =
  source.match(
    /protected endFlight\(button: number, event: Pick<PointerEvent, 'buttons'>\): void \{[\s\S]*?\n {2}\}/,
  )?.[0] ?? ''
const draggingChanged = handler('onDraggingChanged', '')

describe('SceneRenderer and the buttons that fly', () => {
  // A regex that matched nothing would make every assertion below vacuously true.
  it('finds the three handlers the rest of this file reads', () => {
    expect([pointerDown, pointerUp, draggingChanged].map(found => found.length > 0)).toEqual([
      true,
      true,
      true,
    ])
  })

  it('arms the flight from either button', () => {
    expect(pointerDown.match(/this\.startFlight\(/g)).toHaveLength(2)
  })

  it('ends it on either release', () => {
    expect(pointerUp.match(/this\.endFlight\(/g)).toHaveLength(2)
  })

  /**
   * The whole point of the left button arming a flight: it is ADDED. `pressed` is what the
   * release picks from, and the view helper still takes the click before the scene does — both
   * settled before the flight is armed, so neither can be lost to it.
   */
  it('leaves the left button the gesture it already had', () => {
    expect(pointerDown).toContain('this.turnToViewHelper(event)')
    expect(pointerDown.indexOf('this.pressed = ')).toBeLessThan(
      pointerDown.lastIndexOf('this.startFlight('),
    )
  })

  // Letting go of `W` before the button leaves a release that never moved a pixel, which is what
  // a click looks like — the right button already reads `flew` before raising its menu.
  it('picks nothing on a release that flew', () => {
    expect(pointerUp).toMatch(/if \(flew \|\| !wasClick\(/)
  })

  it('drops the flight the left button armed once a gizmo takes the handle', () => {
    expect(draggingChanged).toContain('this.flownWith === 0')
    expect(draggingChanged).toContain('this.flownWith = null')
  })

  // Never from one alone: the mode flies with no button, and a button flies with no mode.
  it('reads the flight from the button that armed it, or from the armed mode', () => {
    expect(source).toContain('return this.flownWith !== null || this.navigating')
  })

  /**
   * The defect this case exists for: `OrbitControls.update()` ends on `lookAt(target)`, so an
   * orbit left running through the mode undoes the turn `onLookMove` just wrote, every frame.
   */
  it('takes the orbit out of the loop while the mode is armed', () => {
    const syncPaneFreeze =
      source.match(/protected syncPaneFreeze\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

    expect(syncPaneFreeze).toContain('this.navigating')
  })
})

describe('SceneRenderer flight ownership', () => {
  /**
   * A click during an armed flight ends the BUTTON's flight, and used to take the keys with it:
   * the camera stopped with `W` still physically down, and nothing pushes the set again until the
   * next key transition. A PERMANENT flight is the same reading: the release of a click that
   * armed nothing must not stop a camera whose key is still down.
   */
  it('leaves the held keys alone when a button ends but the camera still owns them', () => {
    expect(endFlight).toContain(
      "if (!this.navigating && this.scheme.fly !== 'always') this.held.clear()",
    )
    // A handle GRABBED is the exception, and it holds for every scheme: one gesture must not
    // move the object and the point of view at once, permanent flight included.
    expect(draggingChanged).toContain('if (!this.navigating) this.held.clear()')
  })

  it('captures the pointer for as long as the mode is armed', () => {
    const setNavigating =
      source.match(/setNavigating\(on: boolean\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

    expect(setNavigating).toContain('requestPointerLock')
  })

  /**
   * The wheel means speed in the MODE alone. Gated on `flying` it would change meaning under a
   * held button, where the manual promises a dolly and no hint is on screen to say otherwise.
   */
  it('spends the wheel on speed in pointer-lock mode and under the right flight button', () => {
    const spend =
      source.match(
        /protected spendWheelOnSpeed\(event: WheelEvent\): boolean \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? ''

    expect(spend).toContain('if (!this.navigating && this.flownWith !== 2) return false')
  })

  // The same trap `turnToViewHelper` guards the trihedron against.
  it('rests the pivot ahead of the camera rather than where the flight left it', () => {
    const restPivot = source.match(/protected restPivot\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

    // Whitespace collapsed: Prettier wraps this very call, and a literal would break on a
    // reformat that changed nothing.
    const written = restPivot.replace(/\s+/g, '')

    expect(written).toContain('orbit.target.copy(camera.position)')
    expect(written).toContain('PIVOT_AHEAD')
  })

  /**
   * The defect this file exists for. `freezePanes` ends in `armOrbits(null)`, which writes
   * `controls.enabled = false` on the MAIN orbit in every layout — so freezing under the left
   * button takes away the very rotation that button is held down for. Both places that freeze
   * must therefore name the right button, never `flying`.
   */
  it('never freezes the panes under the left button, which would cost it its rotation', () => {
    const startFlight =
      source.match(/protected startFlight\(event: PointerEvent\): void \{[\s\S]*?\n {2}\}/)?.[0] ??
      ''
    const syncPaneFreeze =
      source.match(/protected syncPaneFreeze\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

    expect(startFlight).toMatch(/if \(event\.button === 2\) this\.viewport\.freezePanes\(true\)/)
    expect(syncPaneFreeze).toContain('this.flownWith === 2')
    expect(syncPaneFreeze).not.toMatch(/\bthis\.flying\b/)
  })
})

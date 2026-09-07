import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * Sculpt as an exclusive session, read as text for the reason `sceneRendererMarquee.test.ts`
 * gives: the engine cannot be built without a WebGL context.
 */
describe('SceneRenderer and sculpt mode', () => {
  const method = (signature: string): string =>
    source.match(new RegExp(`(?:private |public )?${signature} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''

  const handler = (name: string, args: string): string =>
    source.match(new RegExp(`${name} = \\(${args}\\): void => \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''

  const privateMethod = (signature: string): string =>
    source.match(new RegExp(`private ${signature} \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''
  const attachGizmo = method('attachGizmo\\(\\): void')
  const armMarquee = method('armMarquee\\(event: PointerEvent\\): void')
  const pointerDown = handler('onPointerDown', 'event: PointerEvent')
  const pointerMove = handler('onPointerMove', 'event: PointerEvent')
  const pointerUp = handler('onPointerUp', 'event: PointerEvent')
  const leftUp = privateMethod('endLeftButton\\(event: PointerEvent\\): void')
  const setSculptMode = method('setSculptMode\\(on: boolean\\): void')
  const moveSculptPointer = method('moveSculptPointer\\(event: PointerEvent\\): void')

  it('finds the paths sculpt exclusivity is written in', () => {
    expect(
      [attachGizmo, armMarquee, pointerDown, pointerMove, pointerUp, leftUp, setSculptMode].map(
        found => found.length > 0,
      ),
    ).toEqual([true, true, true, true, true, true, true])
  })

  it('detaches the gizmo while sculpt is on', () => {
    expect(attachGizmo).toContain('this.sculptMode')
    expect(attachGizmo).toContain('gizmo.detach()')
    expect(setSculptMode).toContain('this.gizmo?.detach()')
  })

  it('does not arm the marquee while sculpt is on', () => {
    expect(armMarquee.indexOf('if (this.sculptMode) return')).toBeGreaterThan(-1)
    expect(armMarquee.indexOf('if (this.sculptMode) return')).toBeLessThan(
      armMarquee.indexOf('this.marquee ='),
    )
  })

  it('does not pick a node on click while sculpt is on', () => {
    expect(leftUp).toContain('if (this.sculptMode) return')
  })

  it('reattaches the gizmo once sculpt is off', () => {
    expect(setSculptMode).toContain('this.attachGizmo()')
  })

  it('rays only the relief mesh while sculpting, not the classic nodes', () => {
    expect(source).toContain('this.raycaster.intersectObject(this.relief.object, true)')
    expect(pointerDown).toContain('this.beginReliefStrokeFrom(event)')
    expect(pointerMove).toContain('this.moveSculptPointer(event)')
    expect(moveSculptPointer).toContain('this.aimReliefBrush(event)')
    expect(moveSculptPointer).toContain('this.moveReliefStrokeFrom(event)')
  })
})

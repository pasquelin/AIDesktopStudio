// @vitest-environment jsdom

import { Group, Vector3 } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'

const pointer = (
  type: string,
  options: PointerEventInit & { button?: number } = {},
): PointerEvent =>
  new PointerEvent(type, {
    button: 2,
    buttons: type === 'pointerup' ? 0 : 2,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    ...options,
  })

const rendererOf = (onFlySpeedChange = vi.fn()): SceneRenderer =>
  new SceneRenderer({
    onSelect: vi.fn(),
    onTransform: vi.fn(),
    onFlySpeedChange,
    loadModel: async () => new Group(),
  })

describe('SceneRenderer mouse-look navigation', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  })

  it('turns the camera while the right flight button is dragged', () => {
    const renderer = rendererOf()
    const camera = renderer['viewport'].camera
    const before = camera.quaternion.clone()

    renderer['startFlight'](pointer('pointerdown'))
    renderer['onPointerMove'](pointer('pointermove', { clientX: 140, clientY: 120 }))

    expect(camera.quaternion.equals(before)).toBe(false)
  })

  it('keeps the camera aimed at the subject on the first pixel of a right-button look', () => {
    const renderer = rendererOf()
    const camera = renderer['viewport'].camera
    const before = camera.getWorldDirection(new Vector3())

    renderer['startFlight'](pointer('pointerdown'))
    renderer['onPointerMove'](pointer('pointermove', { clientX: 101, clientY: 100 }))

    expect(camera.getWorldDirection(new Vector3()).dot(before)).toBeGreaterThan(0.99)
  })

  it('uses the wheel to tune flight speed while the right button owns navigation', () => {
    const onSpeed = vi.fn()
    const renderer = rendererOf(onSpeed)
    renderer['startFlight'](pointer('pointerdown'))

    expect(renderer['spendWheelOnSpeed'](new WheelEvent('wheel', { deltaY: -100 }))).toBe(true)
    expect(onSpeed).toHaveBeenCalledOnce()
  })

  it('ends a right-button flight when its pointer is cancelled', () => {
    const renderer = rendererOf()
    renderer['startFlight'](pointer('pointerdown'))

    renderer['onPointerCancel'](pointer('pointercancel'))

    expect(renderer['flightPointer']).toBeNull()
    expect(renderer['flownWith']).toBeNull()
  })

  it('ends and thaws without rotating when the owner moves after a lost release', () => {
    const renderer = rendererOf()
    const camera = renderer['viewport'].camera
    const freeze = vi.spyOn(renderer['viewport'], 'freezePanes')
    renderer['startFlight'](pointer('pointerdown'))
    const before = camera.quaternion.clone()

    renderer['onPointerMove'](pointer('pointermove', { buttons: 0, clientX: 900, clientY: 900 }))

    expect(camera.quaternion.equals(before)).toBe(true)
    expect(renderer['flightPointer']).toBeNull()
    expect(renderer['flownWith']).toBeNull()
    expect(freeze).toHaveBeenLastCalledWith(false)
  })

  it('ignores move, release and cancellation from another simultaneous pointer', () => {
    const renderer = rendererOf()
    const camera = renderer['viewport'].camera
    renderer['startFlight'](pointer('pointerdown'))
    const before = camera.quaternion.clone()

    renderer['onPointerMove'](pointer('pointermove', { pointerId: 2, clientX: 900, clientY: 900 }))
    renderer['onPointerUp'](pointer('pointerup', { pointerId: 2 }))
    renderer['onPointerCancel'](pointer('pointercancel', { pointerId: 2 }))

    expect(camera.quaternion.equals(before)).toBe(true)
    expect(renderer['flightPointer']?.pointerId).toBe(1)

    renderer['onPointerMove'](pointer('pointermove', { clientX: 120, clientY: 100 }))
    expect(camera.quaternion.equals(before)).toBe(false)
  })
})

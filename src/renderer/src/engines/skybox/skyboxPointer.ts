import { Raycaster, Vector2, type Camera } from 'three'
import { anglesFromDirection, type SphericalAngles } from '@shared/domain/angles'
import { turnBy } from '../viewport/lookAround'
import { gestureFor, type SkyboxGesture } from './sunDrag'

type PointerViewport = {
  camera: Camera
  canvas: HTMLCanvasElement | null
  pointerNdcOf: (event: PointerEvent) => { x: number; y: number } | null
}

export type SkyboxPointerOptions = {
  viewport: PointerViewport
  sun: () => SphericalAngles
  look: () => SphericalAngles
  onLookChange: (look: SphericalAngles) => void
  onSunChange: (sun: SphericalAngles) => void
}

/** Owns the window-level gesture listeners used to turn the sky and drag its sun. */
export function createSkyboxPointer(options: SkyboxPointerOptions): {
  mount: () => void
  dispose: () => void
} {
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let gesture: SkyboxGesture | null = null
  let lastPointer: { x: number; y: number } | null = null

  function rayDirection(event: PointerEvent): { x: number; y: number; z: number } | null {
    const ndc = options.viewport.pointerNdcOf(event)
    if (!ndc) return null
    pointer.set(ndc.x, ndc.y)
    raycaster.setFromCamera(pointer, options.viewport.camera)
    const { x, y, z } = raycaster.ray.direction
    return { x, y, z }
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const direction = rayDirection(event)
    if (!direction) return
    gesture = gestureFor(direction, options.sun())
    lastPointer = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event: PointerEvent): void {
    if (!gesture || !lastPointer) return
    if (gesture === 'sun') {
      const direction = rayDirection(event)
      if (direction) options.onSunChange(anglesFromDirection(direction, options.sun()))
      return
    }
    const look = turnBy(
      options.look(),
      event.clientX - lastPointer.x,
      event.clientY - lastPointer.y,
    )
    lastPointer = { x: event.clientX, y: event.clientY }
    options.onLookChange(look)
  }

  function onPointerUp(): void {
    gesture = null
    lastPointer = null
  }

  return {
    mount: () => {
      options.viewport.canvas?.addEventListener('pointerdown', onPointerDown)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    dispose: () => {
      options.viewport.canvas?.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    },
  }
}

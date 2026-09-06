import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * Read as text for the reason `sceneRendererRedraw.test.ts` gives: the engine cannot be built
 * without a WebGL context. What the freeze BUYS is measured on the viewport, which can be
 * mounted — see « leaves a camera written by hand where it was put ».
 */
describe('SceneRenderer and the camera a running game writes', () => {
  const method = (name: string, args = ''): string =>
    source.match(new RegExp(`\\n  ${name}\\(${args}\\): void \\{[\\s\\S]*?\\n {2}\\}`))?.[0] ?? ''

  it('takes the orbits when the game places a view, and gives them back on release', () => {
    expect(method('placeView', 'placement: CameraPlacement')).toContain('this.viewDriven = true')
    expect(method('placeView', 'placement: CameraPlacement')).toContain('this.syncPaneFreeze()')
    expect(method('releaseView')).toContain('this.viewDriven = false')
    expect(method('releaseView')).toContain('this.syncPaneFreeze()')
  })

  /** The lens is the node's while a game films through it, and the person's own again after. */
  it('draws through the lens a placed view carries, and gives the settings back on release', () => {
    expect(method('placeView', 'placement: CameraPlacement')).toContain(
      'this.drivenLens = placement.fieldOfView ?? null',
    )
    expect(method('releaseView')).toContain('this.drivenLens = null')
  })

  /** Or a preference edited mid-game undoes the node's lens until the camera next moves. */
  it('lets a driven lens win over a preference edited while it is held', () => {
    expect(source).toContain('setFieldOfView(this.drivenLens ?? this.view.fieldOfView)')
    expect(
      source.match(/configure\(next: ViewportOptions\): void \{[\s\S]*?\n {2}\}/)?.[0],
    ).toContain('this.driveLens()')
  })

  /** The flag alone would freeze nothing: the freeze is composed in one place, and reads all four. */
  it('counts a driven view among the gestures that freeze the panes', () => {
    const freeze = source.match(/protected syncPaneFreeze\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? ''

    expect(freeze).toContain('this.viewDriven')
  })
})

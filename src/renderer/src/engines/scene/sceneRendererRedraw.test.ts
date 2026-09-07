import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * What the camera preview's cache rests on, and what nothing else can hold.
 *
 * The engine reuses the picture it drew for the preview on every frame where what a scene camera
 * FILMS has not moved — an orbit, a fly, damping settling. Two named intents say which is which:
 * `redraw` for the scene, `repaint` for the workshop drawn over it. A bare `requestRender` is
 * neither, and would leave the monitor showing an instant that is gone with nothing to notice.
 *
 * Read as text because that is the only way to see the ABSENCE of a call. The engine cannot be
 * built without a WebGL context, and a test that drove it would only ever cover the paths it
 * happened to take.
 */
describe('SceneRenderer and the preview it invalidates', () => {
  const REDRAW = /protected redraw\(\): void \{[\s\S]*?\n {2}\}/
  const REPAINT = /protected repaint\(\): void \{[\s\S]*?\n {2}\}/
  const REFRESH = /protected refreshWithoutShadows\(\): void \{[\s\S]*?\n {2}\}/
  const SELECTIVE = /protected refreshChangedShadows\(\): void \{[\s\S]*?\n {2}\}/
  const TEXTURE_REFRESH = /protected refreshMaterialTexture\([\s\S]*?\n {2}\}/
  const FRAME_ALL = /frameAll\(\): boolean \{[\s\S]*?\n {2}\}/

  /**
   * The NAME and not the call: `createEnvironment` and the three texture binders are handed
   * `requestRender` as a callback, and a skybox or a map landing changes what the camera films
   * just as much as an edit does. Reading only `requestRender()` left those four passing the
   * viewport's own method straight through, and the preview kept the instant before.
   */
  it('asks for every frame through `redraw` or `repaint`, never through the viewport directly', () => {
    const elsewhere = source
      .replace(REDRAW, '')
      .replace(REPAINT, '')
      .replace(REFRESH, '')
      .replace(SELECTIVE, '')
      .replace(TEXTURE_REFRESH, '')
      .split('\n')
      .map((line, at) => ({ line: line.trim(), at: at + 1 }))
      .filter(
        ({ line }) =>
          line.includes('viewport.requestRender') ||
          line.includes('viewport.requestCameraRender') ||
          line.includes('viewport.requestShadowRender'),
      )

    expect(elsewhere).toEqual([])
  })

  /**
   * The half this file was missing, and the half a 1 013-file split walked straight through: the
   * three cheaper intents stayed DEFINED and tested while every caller became `redraw`, so a
   * selection paid a full depth pass and every gate stayed green.
   */
  it('leaves no named refresh intent without a caller', () => {
    const orphans = ['refreshWithoutShadows', 'refreshChangedShadows', 'repaint'].filter(
      intent => !source.includes(`this.${intent}()`),
    )

    expect(orphans).toEqual([])
  })

  it('refreshes filmed pixels without invalidating unchanged shadow maps', () => {
    const refresh = REFRESH.exec(source)?.[0] ?? ''

    expect(refresh).toContain('this.viewport.invalidateInset()')
    expect(refresh).toContain('this.viewport.requestCameraRender()')
  })

  it('refreshes texture pixels without shadows unless displacement changes the silhouette', () => {
    const refresh = TEXTURE_REFRESH.exec(source)?.[0] ?? ''

    expect(refresh).toContain('SHADOW_TEXTURE_SLOTS.includes(slot)')
    expect(refresh).toContain('this.redraw()')
    expect(refresh).toContain('this.refreshWithoutShadows()')
    expect(source.match(/createMaterialTextures\([\s\S]*?refreshMaterialTexture/g)).toHaveLength(2)
    // One list, read by the arrival AND by the descriptor sync: naming the slot twice let two
    // judgements on what a shadow sees drift apart with nothing to say so.
    expect(source).not.toContain("'displacementMap'")
  })

  it('invalidates filmed pixels and only changed shadow maps together', () => {
    const selective = SELECTIVE.exec(source)?.[0] ?? ''

    expect(selective).toContain('this.viewport.invalidateInset()')
    expect(selective).toContain('this.viewport.requestShadowRender()')
  })

  // 🛑 Without it the Frame button moved the camera and drew nothing until the next gesture.
  it('asks for the frame a hand-made framing has nobody else to draw', () => {
    const frameAll = FRAME_ALL.exec(source)?.[0] ?? ''

    expect(frameAll).toContain('this.frameContents()')
    expect(frameAll).toContain('this.repaint()')
  })

  it('invalidates the preview in `redraw`, and leaves it alone in `repaint`', () => {
    const redraw = REDRAW.exec(source)?.[0] ?? ''
    const repaint = REPAINT.exec(source)?.[0] ?? ''

    expect(redraw).toContain('this.viewport.invalidateInset()')
    expect(redraw).toContain('this.viewport.requestRender()')
    expect(repaint).toContain('this.viewport.requestCameraRender()')
    expect(repaint).not.toContain('invalidateInset')
  })
})

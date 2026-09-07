import { describe, expect, it } from 'vitest'
import source from './webRender.ts?raw'

/**
 * The seam no jsdom test can reach: `createWebRender` builds a real `WebGLRenderer`. Read as
 * source, like `sceneRendererRelief.test.ts` does, so the one call that settles a game's frame
 * cannot be dropped in silence. Comments are stripped first: a commented-out call read as live
 * is exactly how such a guard passes on dead code.
 */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('what an exported frame settles before it is drawn', () => {
  it('has a draw to read at all, so the rule below cannot pass on an empty string', () => {
    expect(code).toContain('renderer.render(held.scene, camera)')
  })

  it('settles the frame on its camera, before handing the scene to the renderer', () => {
    expect(code).toContain('held.flush(camera, cast)')
    expect(code.indexOf('held.flush(camera, cast)')).toBeLessThan(
      code.indexOf('renderer.render(held.scene, camera)'),
    )
  })
})

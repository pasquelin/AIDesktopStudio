import { localizedError } from '@shared/localizedError'
import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { createSeamPass, SEAM_SCALE } from './seamShader'

const source = new Texture()

const shader = (): string => createSeamPass(source, { width: 8, height: 8 }).material.fragmentShader

/**
 * jsdom runs no GLSL, so these are assertions on the TEXT of the shader — the same bargain
 * `material-shader.test.ts` makes with three's chunk names. They exist to stop a silent edit
 * of the arithmetic, not to prove it.
 */
describe('the seam shader', () => {
  /** A zero divides into an infinite texel step, and every tap lands on the same pixel. */
  it('refuses a source with no pixels', () => {
    expect(() => createSeamPass(source, { width: 8, height: 0 })).toThrow(
      localizedError('seamSourceEmpty').message,
    )
  })

  it('steps by one texel of the source it was given, on each axis separately', () => {
    const pass = createSeamPass(source, { width: 2048, height: 512 })

    expect(pass.uniforms.uTexel.value.x).toBe(1 / 2048)
    expect(pass.uniforms.uTexel.value.y).toBe(1 / 512)
    expect(pass.uniforms.uSource.value).toBe(source)
  })

  /**
   * A ratio, not a difference. A noisy stone tolerates a jump that would be a scar across smooth
   * plaster: what a viewer reads as a seam is the step at the wrap compared with the grain the
   * picture already has, which is why both are accumulated and one divides the other.
   */
  it('measures the wrap against the grain one texel inside it', () => {
    const text = shader()

    expect(text).toContain('across += abs(left - right);')
    expect(text).toContain('inside += abs(lumaAt(vec2(uTexel.x * 1.5, t)) - left);')
    expect(text).toContain('across += abs(top - bottom);')
    expect(text).toContain('inside += abs(lumaAt(vec2(t, uTexel.y * 1.5)) - top);')
    expect(text).toContain('float ratio = across / max(inside, 1e-4);')
  })

  /** Both wraps: a picture seamless left to right can still band top to bottom. */
  it('reads the two edges that meet on each axis', () => {
    const text = shader()

    expect(text).toContain('float left = lumaAt(vec2(uTexel.x * 0.5, t));')
    expect(text).toContain('float right = lumaAt(vec2(1.0 - uTexel.x * 0.5, t));')
    expect(text).toContain('float top = lumaAt(vec2(t, uTexel.y * 0.5));')
    expect(text).toContain('float bottom = lumaAt(vec2(t, 1.0 - uTexel.y * 0.5));')
  })

  /** The frame holds a byte: the scale the shader divides by is the one the port multiplies back. */
  it('encodes the ratio on the scale the port reads it back with', () => {
    expect(shader()).toContain(`clamp(ratio / ${SEAM_SCALE}.0, 0.0, 1.0)`)
  })
})

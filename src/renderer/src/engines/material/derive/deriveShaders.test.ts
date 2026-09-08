import { localizedError } from '@shared/localizedError'
import { Texture } from 'three'
import { describe, expect, it } from 'vitest'
import { PBR_CHANNELS, type PbrChannel } from '@shared/domain/material'
import { sourceFor } from '../materialState'
import { createDerivePass } from './deriveShaders'

const source = new Texture()

const shaderFor = (channel: PbrChannel): string =>
  createDerivePass(channel, source, { width: 8, height: 8 }).material.fragmentShader

const derivable = PBR_CHANNELS.filter(channel => sourceFor(channel) !== null)

describe('the derivation shaders', () => {
  /**
   * The two tables that have to agree, and neither is derived from the other: `sourceFor` says
   * what a channel reads, the shader table says how it is computed. A channel with a source and
   * no shader offers a derivation that cannot run; a shader with no source has nothing to read.
   */
  it('has a shader for exactly the channels the domain gives a source', () => {
    for (const channel of PBR_CHANNELS) {
      const build = () => shaderFor(channel)
      if (sourceFor(channel)) expect(build).not.toThrow()
      else expect(build).toThrow(localizedError('channelShaderMissing', { channel }).message)
    }
  })

  /** A zero divides into an infinite texel step, and every tap lands on the same pixel. */
  it('refuses a source with no pixels', () => {
    expect(() => createDerivePass('normal', source, { width: 0, height: 8 })).toThrow(
      localizedError('channelSourceEmpty', { channel: 'normal' }).message,
    )
  })

  it('steps by one texel of the source it was given, on each axis separately', () => {
    const pass = createDerivePass('normal', source, { width: 2048, height: 512 })

    // Exact, not `toBeCloseTo`: its default tolerance is 0.005, wider than any real texel step,
    // and it stayed green with the two axes swapped — on the test that names them.
    expect(pass.uniforms.uTexel.value.x).toBe(1 / 2048)
    expect(pass.uniforms.uTexel.value.y).toBe(1 / 512)
    expect(pass.uniforms.uSource.value).toBe(source)
  })

  it('computes each channel with its own shader', () => {
    expect(new Set(derivable.map(shaderFor)).size).toBe(derivable.length)
  })

  /**
   * A normal points into every octant, and the file it lands in holds eight bits per channel
   * with no sign. Written raw, half the surface would clamp to black.
   */
  it('encodes the normal into the unit interval on the way out', () => {
    expect(shaderFor('normal')).toContain('normal * 0.5 + 0.5')
  })

  /**
   * The kernel, verbatim. jsdom runs no GLSL, so these are assertions on the TEXT of the shader
   * — the same bargain `material-shader.test.ts` makes with three's chunk names. Counting the
   * eight taps was not one: a Sobel that read a corner twice and ignored another counted eight
   * all the same, and the mutation stayed green on the test that claimed to watch it.
   */
  it('weights the eight neighbours the way a Sobel does, each one once', () => {
    const shader = shaderFor('normal')

    expect(shader).toContain('float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);')
    expect(shader).toContain('float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);')
  })

  /** Rec. 709. Permuted, every derivation that reads a colour reads the wrong brightness. */
  it('weighs luminance the way the grading pass does', () => {
    expect(shaderFor('height')).toContain('vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);')
  })

  /**
   * The direction of the relief, in one line. Both signs matter: the first is what tilts a slope
   * away from the direction it climbs, the second is the OpenGL convention for green.
   */
  it('tilts the normal away from the slope it climbs', () => {
    expect(shaderFor('normal')).toContain('normalize(vec3(-dx, -dy, 1.0))')
  })

  /**
   * Which way round the occlusion reads. Inverted either at the subtraction or at the write, an
   * AO map lights the hollows and darkens what stands out — and both mutations were green.
   */
  it('darkens what sits below its neighbourhood, and only that', () => {
    const shader = shaderFor('ao')

    expect(shader).toContain('clamp((around - here) * 2.0, 0.0, 1.0)')
    expect(shader).toContain('vec4(vec3(1.0 - occlusion), 1.0)')
    // Three rings: one radius answers only for detail of that exact size.
    expect(shader).toContain('const float RINGS = 3.0;')
  })

  /** Same picture read the other way round: what one calls deep, the other calls matte. */
  it('inverts the luminance for roughness and not for height', () => {
    expect(shaderFor('roughness')).toContain('vec4(vec3(1.0 - luma), 1.0)')
    expect(shaderFor('height')).toContain('vec4(vec3(luma), 1.0)')
  })

  /** Every pass is opaque: an alpha below one would be read back as premultiplied noise. */
  it('writes a fully opaque pixel', () => {
    for (const channel of derivable) {
      expect(shaderFor(channel)).toMatch(/gl_FragColor = vec4\([^;]*, 1\.0\);/)
    }
  })
})

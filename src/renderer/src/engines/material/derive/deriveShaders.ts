import { localizedError } from '@shared/localizedError'
import { ShaderMaterial, Vector2, type Texture } from 'three'
import type { PbrChannel } from '@shared/domain/material'
import { QUAD_VERTEX_SHADER } from '../../gpu/passes/quad'
import { LUMA, SOURCE_PREAMBLE } from './glsl'
import type { PictureSize } from './offscreen'

/**
 * The four channels a texture can compute for itself, one shader each. Everything happens per
 * pixel on the GPU: a 4K height map is 16 million samples, and a JS loop over them is a frozen
 * window — invariant 6, first line.
 *
 * **None of them takes a strength.** Every derivation already has a live control at render
 * time — `normalScale` for the relief, `aoIntensity` for the occlusion, `roughnessRange` for
 * the remap — so the pixels are baked neutral and the material panel is what one turns. Baking
 * a strength in would freeze into a file a decision the sliders already make reversible.
 */

/** A neighbour of the pixel being written, in texels. Shared by the two shaders that slope. */
const HEIGHT_AT = /* glsl */ `
float heightAt(vec2 offset) {
  return texture2D(uSource, vUv + offset * uTexel).r;
}
`

/**
 * Both shaders that read a base colour read it the same way — through its luminance — and
 * differ only in what they make of it. Written once so the two cannot drift apart on the
 * weights, which is the part that decides what the relief looks like.
 *
 * Read as stored rather than decoded to linear: the value is what the eye reads as depth in the
 * picture, and the file it goes back into is read as data by everything downstream.
 */
function fromLuminance(expression: string): string {
  return /* glsl */ `
${SOURCE_PREAMBLE}
${LUMA}

void main() {
  float luma = dot(texture2D(uSource, vUv).rgb, LUMA);
  gl_FragColor = vec4(vec3(${expression}), 1.0);
}
`
}

const HEIGHT_FROM_COLOR = fromLuminance('luma')

// Inverted: in a photographed albedo the dark pixels are the crevices and the worn matte
// patches, and the bright ones the polished faces. A starting point, not a measurement — which
// is exactly what the double handle of the material panel is there to correct.
const ROUGHNESS_FROM_COLOR = fromLuminance('1.0 - luma')

const NORMAL_FROM_HEIGHT = /* glsl */ `
${SOURCE_PREAMBLE}
${HEIGHT_AT}

void main() {
  // Sobel: the 3x3 kernel weights the direct neighbours twice, which is what stops a single
  // noisy texel from becoming a spike the whole normal map shows.
  float tl = heightAt(vec2(-1.0,  1.0));
  float t  = heightAt(vec2( 0.0,  1.0));
  float tr = heightAt(vec2( 1.0,  1.0));
  float l  = heightAt(vec2(-1.0,  0.0));
  float r  = heightAt(vec2( 1.0,  0.0));
  float bl = heightAt(vec2(-1.0, -1.0));
  float b  = heightAt(vec2( 0.0, -1.0));
  float br = heightAt(vec2( 1.0, -1.0));

  float dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float dy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);

  // Negated: a slope that climbs towards +u tilts the surface away from it. And +y for green,
  // which is the OpenGL convention — invertNormalGreen is what answers a DirectX pipeline.
  vec3 normal = normalize(vec3(-dx, -dy, 1.0));
  gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
`

const AO_FROM_HEIGHT = /* glsl */ `
${SOURCE_PREAMBLE}
${HEIGHT_AT}

// Three rings rather than one: occlusion is a question about the neighbourhood, and a single
// radius answers it only for detail of that exact size.
const float RINGS = 3.0;
const float TAPS = 8.0;
const float STEP = 4.0;

void main() {
  float here = heightAt(vec2(0.0));
  float around = 0.0;

  for (float ring = 1.0; ring <= RINGS; ring += 1.0) {
    float radius = ring * STEP;
    for (float tap = 0.0; tap < TAPS; tap += 1.0) {
      float angle = tap * 6.2831853 / TAPS;
      around += heightAt(vec2(cos(angle), sin(angle)) * radius);
    }
  }

  around /= RINGS * TAPS;
  // Occluded where the pixel sits below what surrounds it. Scaled by 2 so a pit half the depth
  // of the map's range reads as fully closed — flatter than that and no relief is legible.
  float occlusion = clamp((around - here) * 2.0, 0.0, 1.0);
  gl_FragColor = vec4(vec3(1.0 - occlusion), 1.0);
}
`

/**
 * Which shader writes which channel. What it reads is NOT repeated here: `sourceFor` in the
 * domain is the one answer to that, and a second copy would be free to contradict it. What has
 * to hold is that the two tables cover the same four channels, and a test says so.
 */
const FRAGMENT_BY_CHANNEL: Record<PbrChannel, string | null> = {
  baseColor: null,
  normal: NORMAL_FROM_HEIGHT,
  roughness: ROUGHNESS_FROM_COLOR,
  metalness: null,
  ao: AO_FROM_HEIGHT,
  height: HEIGHT_FROM_COLOR,
  emissive: null,
  edge: null,
}

type DeriveUniforms = {
  uSource: { value: Texture | null }
  /** One texel, in uv. What a shader adds to `vUv` to reach its neighbour. */
  uTexel: { value: Vector2 }
}

export type DerivePass = {
  readonly material: ShaderMaterial
  readonly uniforms: DeriveUniforms
}

/**
 * The pass that computes a channel, aimed at the source it reads. Throws for a channel nothing
 * derives, and for a source with no pixels: a pass that silently drew nothing would write an
 * empty picture into the project.
 *
 * The size is passed in rather than read off the texture: `Texture.image` is whatever the
 * loader put there, and the caller already had to know it to size the frame it draws into.
 */
export function createDerivePass(
  channel: PbrChannel,
  source: Texture,
  size: PictureSize,
): DerivePass {
  const fragmentShader = FRAGMENT_BY_CHANNEL[channel]
  if (fragmentShader === null) throw localizedError('channelShaderMissing', { channel: channel })
  if (size.width <= 0 || size.height <= 0)
    throw localizedError('channelSourceEmpty', { channel: channel })

  const uniforms: DeriveUniforms = {
    uSource: { value: source },
    uTexel: { value: new Vector2(1 / size.width, 1 / size.height) },
  }

  return {
    material: new ShaderMaterial({
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader,
      uniforms,
    }),
    uniforms,
  }
}

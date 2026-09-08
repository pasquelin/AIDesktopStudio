import { localizedError } from '@shared/localizedError'
import { ShaderMaterial, Vector2, type Texture } from 'three'
import { QUAD_VERTEX_SHADER } from '../../gpu/passes/quad'
import { LUMA, SOURCE_PREAMBLE } from './glsl'
import type { PictureSize } from './offscreen'

/**
 * How badly a picture disagrees with itself where it wraps.
 *
 * A tiled texture meets its own opposite edge: the left column sits against the right one, the
 * top row against the bottom. What a viewer reads as a seam is the size of that step compared
 * with the detail already in the picture — a noisy stone tolerates a jump that would be a scar
 * across a smooth plaster.
 *
 * So the answer is a **ratio**, not a difference: the average step across the wrap, over the
 * average step one texel inside it. One means the wrap is no worse than the picture's own
 * grain; well above one means an edge somebody will see.
 */

/** Samples along each edge. Constant, so the loop unrolls — and enough for a 4K edge. */
const SAMPLES = 256

const FRAGMENT_SHADER = /* glsl */ `
${SOURCE_PREAMBLE}
${LUMA}

const float SAMPLES = ${SAMPLES}.0;

float lumaAt(vec2 uv) {
  return dot(texture2D(uSource, uv).rgb, LUMA);
}

void main() {
  float across = 0.0;
  float inside = 0.0;

  for (float i = 0.0; i < SAMPLES; i += 1.0) {
    float t = (i + 0.5) / SAMPLES;

    // The two columns that meet when the picture repeats, then the two that are already
    // neighbours one texel in — the grain this edge has to be judged against.
    float left = lumaAt(vec2(uTexel.x * 0.5, t));
    float right = lumaAt(vec2(1.0 - uTexel.x * 0.5, t));
    across += abs(left - right);
    inside += abs(lumaAt(vec2(uTexel.x * 1.5, t)) - left);

    float top = lumaAt(vec2(t, uTexel.y * 0.5));
    float bottom = lumaAt(vec2(t, 1.0 - uTexel.y * 0.5));
    across += abs(top - bottom);
    inside += abs(lumaAt(vec2(t, uTexel.y * 1.5)) - top);
  }

  // A flat picture has no grain to divide by, and no seam either: the epsilon answers zero over
  // zero with zero rather than with whatever the driver makes of it.
  float ratio = across / max(inside, 1e-4);
  // Encoded into the byte the frame can hold. Ten is the top of the scale on purpose — past
  // that a seam is not more visible, it is only more arithmetic.
  gl_FragColor = vec4(vec3(clamp(ratio / 10.0, 0.0, 1.0)), 1.0);
}
`

/** The scale the shader encodes into a byte, needed again to read it back. */
export const SEAM_SCALE = 10

type SeamUniforms = {
  uSource: { value: Texture | null }
  uTexel: { value: Vector2 }
}

export type SeamPass = {
  readonly material: ShaderMaterial
  readonly uniforms: SeamUniforms
}

export function createSeamPass(source: Texture, size: PictureSize): SeamPass {
  if (size.width <= 0 || size.height <= 0) throw localizedError('seamSourceEmpty')

  const uniforms: SeamUniforms = {
    uSource: { value: source },
    uTexel: { value: new Vector2(1 / size.width, 1 / size.height) },
  }

  return {
    material: new ShaderMaterial({
      vertexShader: QUAD_VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
    }),
    uniforms,
  }
}

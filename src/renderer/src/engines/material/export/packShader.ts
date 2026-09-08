import { localizedError } from '@shared/localizedError'
import { ShaderMaterial, type Texture } from 'three'
import {
  assetsOf,
  type ResolvedComponent,
  type ResolvedPicture,
} from '@shared/domain/materialExport'
import { QUAD_VERTEX_SHADER } from '../../gpu/passes/quad'
import { PIXEL_PREAMBLE } from '../derive/glsl'
import type { OffscreenPass } from '../derive/offscreen'

/**
 * One shader that writes one exported picture.
 *
 * Every target's recipe is the same operation with different wiring — copy a channel, pack
 * three into one, invert a green — so there is one pass rather than one per engine, and it is
 * built from the recipe the domain already resolved. In one pass on the GPU, per invariant 6:
 * a 4K ORM is 16 million pixels, and three of them read per pixel.
 *
 * The sources are sampled in uv rather than in texels, so channels of different sizes pack
 * together and land on the frame the caller sized — which is also how a target with a ceiling
 * on its maps gets one for free.
 */

/**
 * A number GLSL will read as a float. `1` is an int there, and `vec4(1, ...)` fails to compile
 * on a driver that does not implicitly convert — which is the driver somebody else is on.
 */
function glslFloat(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : `${value}`
}

/**
 * What one component of the output reads, as an expression.
 *
 * The two ends collapse to nothing where they are the identity, and to a subtraction where they
 * are its reverse: `mix` covers all three, but a shader that spelled out `mix(0.0, 1.0, s)` for
 * the ordinary case would be one nobody can read against the recipe it came from.
 */
function expressionFor(component: ResolvedComponent, assets: readonly string[]): string {
  if ('constant' in component) return glslFloat(component.constant)

  const sample = `texture2D(uSource${assets.indexOf(component.assetId)}, vUv).${component.from}`
  if (component.low === 0 && component.high === 1) return sample
  if (component.low === 1 && component.high === 0) return `(1.0 - ${sample})`

  return `mix(${glslFloat(component.low)}, ${glslFloat(component.high)}, ${sample})`
}

type PackUniforms = Record<string, { value: Texture }>

/**
 * The pass that writes one picture, aimed at the channels it reads.
 *
 * The textures come in the order `assetsOf` names them — the order the run was asked to decode
 * them in — so the sampler a component reads is its index, with nothing to look up.
 *
 * Throws for an asset the caller did not decode: a sampler left unbound reads black on every
 * driver, and an ORM whose roughness came out black is a texture that ships fully polished with
 * nothing on the way to say why.
 */
export function createPackPass(
  picture: ResolvedPicture,
  textures: readonly Texture[],
): OffscreenPass {
  const assets = assetsOf(picture)
  const uniforms: PackUniforms = {}

  const declarations = assets.map((assetId, index) => {
    const texture = textures[index]
    if (!texture)
      throw localizedError('packedImageNotDecoded', { name: picture.name, asset: assetId })

    uniforms[`uSource${index}`] = { value: texture }
    return `uniform sampler2D uSource${index};`
  })

  const fragmentShader = /* glsl */ `
${PIXEL_PREAMBLE}
${declarations.join('\n')}

void main() {
  gl_FragColor = vec4(
    ${expressionFor(picture.red, assets)},
    ${expressionFor(picture.green, assets)},
    ${expressionFor(picture.blue, assets)},
    ${expressionFor(picture.alpha, assets)}
  );
}
`

  return {
    material: new ShaderMaterial({ vertexShader: QUAD_VERTEX_SHADER, fragmentShader, uniforms }),
  }
}

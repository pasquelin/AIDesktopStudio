/**
 * The three things the standard material does not offer, written as TSL nodes: the roughness and
 * metalness remaps, and the cavity mask.
 *
 * The node rewrite of `materialShader.ts`, not a translation of its GLSL. Two differences are
 * deliberate and are the whole reason this is a rewrite:
 *
 * - NO recompilation when a channel is filled or emptied. The GLSL patch is guarded by
 *   `#ifdef USE_ROUGHNESSMAP`, so every slot that goes from empty to filled rebuilds the program.
 *   Here a `has` uniform selects between the remapped texel and the plain factor, and filling a
 *   slot moves a number.
 * - The cavity lands on the DIFFUSE COLOUR rather than on `reflectedLight`, which a node material
 *   exposes no seam on. Identical for a dielectric, where the cavity is used; on a metal, whose
 *   specular tint three derives from that same colour, the Advanced engine darkens a little of
 *   what the Compatible one leaves alone.
 *
 * The uniforms are the ENGINE's — the very objects `materialShader.createUniforms` builds and the
 * material window writes into. A `Vector2` is shared by reference and needs nothing; a scalar and
 * a texture are replaced rather than written into, so those are read back on every render.
 */
import { Color, Texture, type MeshStandardMaterial } from 'three'
import type { MaterialUniforms } from '../material/materialShader'
import type { GpuModule } from './gpuModule'

/** What the mask samples where no picture is bound. Its intensity is zero there, so it is unlit. */
const NO_MASK = new Texture()

/**
 * Writes the studio's three additions onto a node material.
 *
 * Everything the material itself holds — its two factors and its colour — is read back on every
 * render rather than copied once: the window writes them onto the material like any other
 * property, and a copy would freeze the sliders at what they held when the panel opened.
 */
export function applyMaterialNodes(
  { tsl }: GpuModule,
  material: MeshStandardMaterial,
  uniforms: MaterialUniforms,
): void {
  const { float, mix, texture, uniform, uv, vec3 } = tsl

  const roughnessRemap = uniform(uniforms.roughnessRemap.value)
  const metalnessRemap = uniform(uniforms.metalnessRemap.value)
  const edgeIntensity = uniform(0).onRenderUpdate(() => uniforms.edgeIntensity.value)
  const edgeTransform = uniform(uniforms.edgeTransform.value)
  const edgeMap = texture(NO_MASK).onRenderUpdate(() => uniforms.edgeMap.value ?? NO_MASK)

  const roughness = uniform(0).onRenderUpdate(() => material.roughness)
  const metalness = uniform(0).onRenderUpdate(() => material.metalness)
  const colour = uniform(new Color()).onRenderUpdate(() => material.color)
  const hasRoughnessMap = uniform(0).onRenderUpdate(() => (material.roughnessMap ? 1 : 0))
  const hasMetalnessMap = uniform(0).onRenderUpdate(() => (material.metalnessMap ? 1 : 0))
  const roughnessTexel = texture(NO_MASK).onRenderUpdate(() => material.roughnessMap ?? NO_MASK)
  const metalnessTexel = texture(NO_MASK).onRenderUpdate(() => material.metalnessMap ?? NO_MASK)

  // The channels three itself reads: green for roughness, blue for metalness — an ORM picture
  // packs them that way, and reading red would answer with the occlusion.
  material.roughnessNode = roughness.mul(
    mix(float(1), mix(roughnessRemap.x, roughnessRemap.y, roughnessTexel.g), hasRoughnessMap),
  )
  material.metalnessNode = metalness.mul(
    mix(float(1), mix(metalnessRemap.x, metalnessRemap.y, metalnessTexel.b), hasMetalnessMap),
  )

  // Its own transform and its own uv: the mask sits in no three slot, so nothing computes a
  // coordinate for it, and the matrix is what keeps it repeating in step with the eight maps
  // that do have one.
  const masked = edgeMap.sample(edgeTransform.mul(vec3(uv(), 1)).xy)
  const cavity = float(1).sub(masked.r.mul(edgeIntensity))
  material.colorNode = colour.mul(cavity)
}

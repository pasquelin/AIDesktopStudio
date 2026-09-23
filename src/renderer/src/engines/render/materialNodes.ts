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
 * The two remapped maps are read through nodes of our own, so they carry their own placement —
 * `placedUv`. Left to the default `uv()` they would read untiled while every other map of the
 * material tiles, and the cavity mask beside them would drift out of step.
 *
 * The uniforms are the ENGINE's — the very objects `materialShader.createUniforms` builds and the
 * material window writes into. A `Vector2` is shared by reference and needs nothing; a scalar and
 * a texture are replaced rather than written into, so those are read back on every render.
 */
import { Matrix3, Texture, type MeshStandardMaterial } from 'three'
import type { MaterialUniforms } from '../material/materialShader'
import type { GpuModule } from './gpuModule'

/** What a slot samples where no picture is bound. Its `has` uniform is zero there. */
const NO_MASK = new Texture()

/** The placement of a map with none — no repeat, no offset, no rotation. */
const NO_TRANSFORM = new Matrix3()

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
  const { float, materialColor, mix, texture, uniform, uv, vec3 } = tsl

  /**
   * Where a map is READ, matrix included. Every PBR map of the window carries a repeat, an
   * offset and a rotation (`placeMap`), and three applies them for the maps it owns; these
   * three are read through nodes of our own, so the matrix has to be carried with them or a
   * tiled roughness reads untiled while the cavity beside it tiles.
   */
  const placedUv = (mapOf: () => Texture | null) => {
    const matrix = uniform(new Matrix3()).onRenderUpdate(() => transformOf(mapOf()))
    return matrix.mul(vec3(uv(), 1)).xy
  }

  const roughnessRemap = uniform(uniforms.roughnessRemap.value)
  const metalnessRemap = uniform(uniforms.metalnessRemap.value)
  const edgeIntensity = uniform(0).onRenderUpdate(() => uniforms.edgeIntensity.value)
  const edgeTransform = uniform(uniforms.edgeTransform.value)
  const edgeMap = texture(NO_MASK).onRenderUpdate(() => uniforms.edgeMap.value ?? NO_MASK)

  const roughness = uniform(0).onRenderUpdate(() => material.roughness)
  const metalness = uniform(0).onRenderUpdate(() => material.metalness)
  const hasRoughnessMap = uniform(0).onRenderUpdate(() => (material.roughnessMap ? 1 : 0))
  const hasMetalnessMap = uniform(0).onRenderUpdate(() => (material.metalnessMap ? 1 : 0))
  const roughnessTexel = texture(NO_MASK).onRenderUpdate(() => material.roughnessMap ?? NO_MASK)
  const metalnessTexel = texture(NO_MASK).onRenderUpdate(() => material.metalnessMap ?? NO_MASK)

  // The channels three itself reads: green for roughness, blue for metalness — an ORM picture
  // packs them that way, and reading red would answer with the occlusion.
  const roughnessRead = roughnessTexel.sample(placedUv(() => material.roughnessMap))
  const metalnessRead = metalnessTexel.sample(placedUv(() => material.metalnessMap))
  material.roughnessNode = roughness.mul(
    mix(float(1), mix(roughnessRemap.x, roughnessRemap.y, roughnessRead.g), hasRoughnessMap),
  )
  material.metalnessNode = metalness.mul(
    mix(float(1), mix(metalnessRemap.x, metalnessRemap.y, metalnessRead.b), hasMetalnessMap),
  )

  // Its own transform and its own uv: the mask sits in no three slot, so nothing computes a
  // coordinate for it, and the matrix is what keeps it repeating in step with the eight maps
  // that do have one.
  const masked = edgeMap.sample(edgeTransform.mul(vec3(uv(), 1)).xy)
  const cavity = float(1).sub(masked.r.mul(edgeIntensity))
  // `materialColor` and not the material's own colour: it is where three multiplies the base
  // colour MAP in, and a plain uniform here would render every textured material flat.
  material.colorNode = materialColor.mul(cavity)
}

/** A map's placement, refreshed as three does before reading it, or the identity for no map. */
function transformOf(map: Texture | null): Matrix3 {
  if (!map) return NO_TRANSFORM
  map.updateMatrix()
  return map.matrix
}

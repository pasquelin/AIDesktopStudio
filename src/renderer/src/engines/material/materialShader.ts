/**
 * The three things the standard material of three does not offer and a texture needs: a remap of
 * what a roughness or a metalness map holds, and a cavity mask, which has no slot at all.
 *
 * Plain surgery on the chunks three ships, rather than a material of our own: the physical shader
 * is what makes a texture judgeable under an environment, and a reimplementation would drift from
 * it release after release. The anchors were checked against three 0.185 — chunk names move
 * between versions, which is why a missing one is reported rather than silently skipped.
 */
import { Matrix3, Vector2, type IUniform, type Material, type Texture } from 'three'
import type { ValueRange, Vector2 as Vector2Like } from '@shared/domain/material'
import type { MaterialState } from './materialState'

/** Uniform and define names, prefixed so nothing can collide with a chunk three adds later. */
export const ROUGHNESS_REMAP = 'scRoughnessRemap'
export const METALNESS_REMAP = 'scMetalnessRemap'
export const EDGE_MAP = 'scEdgeMap'
export const EDGE_INTENSITY = 'scEdgeIntensity'
export const EDGE_TRANSFORM = 'scEdgeTransform'
export const EDGE_DEFINE = 'SC_EDGE_MAP'

/**
 * The pair the shader mixes between. A channel stored the other way round — a smoothness map kept
 * as roughness, which is what the API answers with — is handled by swapping the ends rather than
 * by a branch of its own: `mix(1, 0, v)` IS `1 - v`, so the shader stays one line and no define
 * has to be recompiled when the flag moves.
 */
export function remapOf(range: ValueRange, inverted = false): Vector2Like {
  return inverted ? { x: range.max, y: range.min } : { x: range.min, y: range.max }
}

/**
 * What the patched program reads off a texture. Derived here rather than in the engine so it can
 * be read back without a GPU: the pair a remap sends down depends on the *channel*, not only on
 * the setting, and getting that wrong shows up as a material lit inside out.
 */
export type MaterialFrame = {
  roughnessRemap: Vector2Like
  metalnessRemap: Vector2Like
  edgeIntensity: number
}

export function materialFrameOf({ channels, material }: MaterialState): MaterialFrame {
  return {
    // The flag belongs to the channel, so it is folded in here and not at the slider: a
    // smoothness map is what the API answers with, and the file keeps the pixels as they came.
    roughnessRemap: remapOf(material.roughnessRange, channels.roughness?.inverted === true),
    metalnessRemap: remapOf(material.metalnessRange, channels.metalness?.inverted === true),
    // No mask, no darkening: the setting survives the channel being taken out and put back.
    edgeIntensity: channels.edge ? material.edgeIntensity : 0,
  }
}

/**
 * The uniforms the patched program reads, held by the engine rather than by the shader: three
 * hands `onBeforeCompile` a fresh object on every recompile, and a value written into that one
 * would be lost the next time a slot goes from empty to filled.
 */
export type MaterialUniforms = {
  roughnessRemap: IUniform<Vector2>
  metalnessRemap: IUniform<Vector2>
  edgeMap: IUniform<Texture | null>
  edgeIntensity: IUniform<number>
  edgeTransform: IUniform<Matrix3>
}

/** The identity remap, which is what a texture with no range set has to look like. */
export function createUniforms(): MaterialUniforms {
  return {
    roughnessRemap: { value: new Vector2(0, 1) },
    metalnessRemap: { value: new Vector2(0, 1) },
    edgeMap: { value: null },
    edgeIntensity: { value: 0 },
    edgeTransform: { value: new Matrix3() },
  }
}

/**
 * Whether the cavity code is IN the program at all, which is not the same as whether its uniform
 * holds a picture: an unbound sampler is undefined behaviour on some drivers, so the mask has to
 * be absent from the source rather than merely inert.
 *
 * Written here beside the chunk it guards rather than in the engine that calls it: whoever
 * patches a material this way needs the same pair of defines, and two copies of a pair is one
 * copy free to be spelt half.
 *
 * 🛑 The node engine reads none of this — a TSL graph carries no preprocessor — and calling it
 * there is harmless: `applyMaterialNodes` samples a blank texture where nothing is bound.
 */
export function declareEdgeMap(material: Material, bound: boolean): void {
  const defines = material.defines ?? {}
  if (bound) {
    defines[EDGE_DEFINE] = ''
    // `vUv` exists only where something asks for it, and no slot asks on this mask's behalf.
    defines.USE_UV = ''
  } else {
    delete defines[EDGE_DEFINE]
    delete defines.USE_UV
  }

  material.defines = defines
  material.needsUpdate = true
}

/**
 * The cavity mask carries its own matrix. It sits in no slot, so three builds none for it, and
 * this uniform is the only thing keeping it repeating in step with the seven maps that do have
 * one — without it a tiling change slides the mask off the picture it darkens.
 */
export function syncEdgeTransform(uniforms: MaterialUniforms): void {
  const map = uniforms.edgeMap.value
  if (!map) return

  map.updateMatrix()
  uniforms.edgeTransform.value.copy(map.matrix)
}

/** One place where the field names meet the GLSL ones, so a rename cannot go half done. */
export function bindUniforms(target: Record<string, IUniform>, uniforms: MaterialUniforms): void {
  target[ROUGHNESS_REMAP] = uniforms.roughnessRemap
  target[METALNESS_REMAP] = uniforms.metalnessRemap
  target[EDGE_MAP] = uniforms.edgeMap
  target[EDGE_INTENSITY] = uniforms.edgeIntensity
  target[EDGE_TRANSFORM] = uniforms.edgeTransform
}

/**
 * Declared before `main` rather than appended to the chunk parameters: `onBeforeCompile` receives
 * the assembled source, and there is no chunk left to hook a declaration onto.
 */
const DECLARATIONS = `
uniform vec2 ${ROUGHNESS_REMAP};
uniform vec2 ${METALNESS_REMAP};
#ifdef ${EDGE_DEFINE}
uniform sampler2D ${EDGE_MAP};
uniform float ${EDGE_INTENSITY};
uniform mat3 ${EDGE_TRANSFORM};
#endif
void main() {`

/**
 * Rewritten rather than scaled after the fact, because the chunk multiplies the scalar by the
 * texel: remapping the product would move the value even where no map is bound, and a texture
 * with no roughness map would answer to a slider that describes one.
 */
const ROUGHNESS_REMAPPED = `#include <roughnessmap_fragment>
#ifdef USE_ROUGHNESSMAP
	roughnessFactor = roughness * mix( ${ROUGHNESS_REMAP}.x, ${ROUGHNESS_REMAP}.y, texelRoughness.g );
#endif`

const METALNESS_REMAPPED = `#include <metalnessmap_fragment>
#ifdef USE_METALNESSMAP
	metalnessFactor = metalness * mix( ${METALNESS_REMAP}.x, ${METALNESS_REMAP}.y, texelMetalness.b );
#endif`

/**
 * A cavity mask darkens what light reaches a crease, so it lands on the diffuse terms and leaves
 * the speculars alone — an edge stays as sharp as the shape says it is, it is only less lit.
 *
 * Its own transform and its own uv: the mask has no three slot, so nothing computes a `vUv` for
 * it. `USE_UV` hands over the raw coordinates and the matrix is the one every other map carries,
 * which is what keeps the eight channels from drifting apart under a tiling change.
 */
const CAVITY = `#include <aomap_fragment>
#ifdef ${EDGE_DEFINE}
	float scCavity = 1.0 - texture2D( ${EDGE_MAP}, ( ${EDGE_TRANSFORM} * vec3( vUv, 1.0 ) ).xy ).r * ${EDGE_INTENSITY};
	reflectedLight.directDiffuse *= scCavity;
	reflectedLight.indirectDiffuse *= scCavity;
#endif`

const PATCHES: readonly { anchor: string; replacement: string }[] = [
  { anchor: 'void main() {', replacement: DECLARATIONS },
  { anchor: '#include <roughnessmap_fragment>', replacement: ROUGHNESS_REMAPPED },
  { anchor: '#include <metalnessmap_fragment>', replacement: METALNESS_REMAPPED },
  { anchor: '#include <aomap_fragment>', replacement: CAVITY },
]

export type PatchedShader = {
  source: string
  /** Anchors three no longer ships. Empty on a supported version; reported, never thrown on. */
  missing: string[]
}

/**
 * The fragment shader, patched. An anchor that has gone leaves its own patch out and says so: a
 * throw here would leave the material with no program at all, and a texture that renders without
 * its remap is worth more than a black sphere.
 */
export function patchFragment(source: string): PatchedShader {
  const missing: string[] = []
  let patched = source

  for (const { anchor, replacement } of PATCHES) {
    if (!patched.includes(anchor)) {
      missing.push(anchor)
      continue
    }
    patched = patched.replace(anchor, replacement)
  }

  return { source: patched, missing }
}

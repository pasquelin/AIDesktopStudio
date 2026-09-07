import type {
  IUniform,
  MeshStandardMaterial,
  Texture,
  WebGLProgramParametersWithUniforms,
} from 'three'
import { GROUND_MATERIAL_CHANNELS } from '@shared/domain/scene'

const LEGACY_HOOKS = new WeakMap<
  MeshStandardMaterial,
  Pick<MeshStandardMaterial, 'onBeforeCompile' | 'customProgramCacheKey'>
>()

/**
 * The cache key follows the uniform OBJECTS, and a constant one silently broke every rebind:
 * three keeps one program per material and cache key, and only the cache MISS branch calls
 * `onBeforeCompile` and installs `parameters.uniforms`. A second bind handing fresh objects under
 * the same key left the GPU sampling the first set — textures the install had just disposed.
 */
const BOUND_UNIFORMS = new WeakMap<
  MeshStandardMaterial,
  { uniforms: ReliefSplatUniforms; key: string }
>()
let boundCount = 0

export type ReliefSplatUniforms = {
  albedos: readonly IUniform<Texture>[]
  normals: readonly IUniform<Texture>[]
  weights: IUniform<Texture>
}

const DECLARATIONS = `${GROUND_MATERIAL_CHANNELS.map((_, index) => `uniform sampler2D scGroundAlbedo${index};`).join('\n')}
${GROUND_MATERIAL_CHANNELS.map((_, index) => `uniform sampler2D scGroundNormal${index};`).join('\n')}
uniform sampler2D scGroundWeights;
varying vec2 scGroundUv;
void main() {`

const WEIGHTS = `vec4 scWeights = texture2D( scGroundWeights, scGroundUv );
float scWeightSum = dot( scWeights, vec4( 1.0 ) );
scWeights = scWeightSum > 0.0 ? scWeights / scWeightSum : vec4( 1.0, 0.0, 0.0, 0.0 );`

const ALBEDO = `${WEIGHTS}
vec4 scAlbedo = ${GROUND_MATERIAL_CHANNELS.map((channel, index) => `texture2D( scGroundAlbedo${index}, scGroundUv ) * scWeights.${channel}`).join(' + ')};
diffuseColor *= scAlbedo;`

const NORMAL = `vec3 scMapN = ${GROUND_MATERIAL_CHANNELS.map((channel, index) => `( texture2D( scGroundNormal${index}, scGroundUv ).xyz * 2.0 - 1.0 ) * scWeights.${channel}`).join(' + ')};
vec3 scQ0 = dFdx( -vViewPosition );
vec3 scQ1 = dFdy( -vViewPosition );
vec2 scSt0 = dFdx( scGroundUv );
vec2 scSt1 = dFdy( scGroundUv );
vec3 scQ1perp = cross( scQ1, normal );
vec3 scQ0perp = cross( normal, scQ0 );
vec3 scT = scQ1perp * scSt0.x + scQ0perp * scSt1.x;
vec3 scB = scQ1perp * scSt0.y + scQ0perp * scSt1.y;
float scDet = max( dot( scT, scT ), dot( scB, scB ) );
float scScale = scDet == 0.0 ? 0.0 : inversesqrt( scDet );
normal = normalize( mat3( scT * scScale, scB * scScale, normal ) * normalize( scMapN ) );`

export function bindReliefSplat(
  material: MeshStandardMaterial,
  uniforms: ReliefSplatUniforms,
): void {
  if (!LEGACY_HOOKS.has(material)) {
    LEGACY_HOOKS.set(material, {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey,
    })
  }
  material.map = null
  material.normalMap = null
  material.onBeforeCompile = shader => {
    bindUniforms(shader, uniforms)
    shader.vertexShader = patchVertex(shader.vertexShader)
    shader.fragmentShader = patchFragment(shader.fragmentShader)
  }
  const bound = BOUND_UNIFORMS.get(material)
  const key = bound?.uniforms === uniforms ? bound.key : `relief-splat-${(boundCount += 1)}`
  BOUND_UNIFORMS.set(material, { uniforms, key })
  material.customProgramCacheKey = () => key
  material.needsUpdate = true
}

export function clearReliefSplat(material: MeshStandardMaterial): void {
  const legacy = LEGACY_HOOKS.get(material)
  if (!legacy) return
  material.onBeforeCompile = legacy.onBeforeCompile
  material.customProgramCacheKey = legacy.customProgramCacheKey
  LEGACY_HOOKS.delete(material)
  BOUND_UNIFORMS.delete(material)
}

export function patchReliefSplatFragment(source: string): string {
  return patchFragment(source)
}

function bindUniforms(
  shader: WebGLProgramParametersWithUniforms,
  uniforms: ReliefSplatUniforms,
): void {
  for (let index = 0; index < GROUND_MATERIAL_CHANNELS.length; index += 1) {
    const albedo = uniforms.albedos[index]
    const normal = uniforms.normals[index]
    if (!albedo || !normal) throw new Error('relief splat uniforms need four material layers')
    shader.uniforms[`scGroundAlbedo${index}`] = albedo
    shader.uniforms[`scGroundNormal${index}`] = normal
  }
  shader.uniforms.scGroundWeights = uniforms.weights
}

function patchVertex(source: string): string {
  return source
    .replace('void main() {', 'varying vec2 scGroundUv;\nvoid main() {')
    .replace('#include <uv_vertex>', '#include <uv_vertex>\nscGroundUv = uv;')
}

function patchFragment(source: string): string {
  return source
    .replace('void main() {', DECLARATIONS)
    .replace('#include <map_fragment>', ALBEDO)
    .replace('#include <normal_fragment_maps>', NORMAL)
}

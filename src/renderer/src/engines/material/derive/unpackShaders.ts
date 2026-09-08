import { localizedError } from '@shared/localizedError'
import { ShaderMaterial, type Texture } from 'three'
import type { PbrChannel } from '@shared/domain/material'
import { QUAD_VERTEX_SHADER } from '../../gpu/passes/quad'
import { SOURCE_PREAMBLE } from './glsl'

/**
 * Taking a channel back OUT of a picture that packs several, which is not a derivation: glTF
 * stores roughness in green and metalness in blue (spec § 3.9.2), so these read what is there
 * rather than guessing at it from a colour the way `deriveShaders` must.
 */
const READS = /* glsl */ `
${SOURCE_PREAMBLE}

void main() {
  gl_FragColor = vec4(vec3(texture2D(uSource, vUv).COMPONENT), 1.0);
}
`

/** Which component of a packed picture each channel is stored in. `null` for the ones none is. */
const COMPONENT_BY_CHANNEL: Record<PbrChannel, string | null> = {
  baseColor: null,
  normal: null,
  roughness: 'g',
  metalness: 'b',
  // Occlusion rides in red where an ORM packs three, and comes out on its own from the
  // `occlusionTexture` slot otherwise — both are true, and this answers only for the packed one.
  ao: 'r',
  height: null,
  emissive: null,
  edge: null,
}

/**
 * The pass that reads one channel out of a packed picture. Throws for a channel no component
 * holds: a pass drawing nothing would write an empty picture into the project.
 */
export function createUnpackPass(channel: PbrChannel, source: Texture): ShaderMaterial {
  const component = COMPONENT_BY_CHANNEL[channel]
  if (component === null) throw localizedError('packedChannelMissing', { channel: channel })

  return new ShaderMaterial({
    vertexShader: QUAD_VERTEX_SHADER,
    fragmentShader: READS.replace('COMPONENT', component),
    uniforms: { uSource: { value: source } },
  })
}

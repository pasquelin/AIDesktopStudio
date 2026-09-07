/**
 * Several per-pixel effects, compiled into ONE full-frame draw — a chain of `ShaderPass` moves a
 * whole frame of bandwidth per effect to spend a few dozen cycles.
 *
 * A `uv` chunk moves the coordinate before the single fetch, a `colour` chunk works on the colour
 * after it. Anything reading the picture at more than one place cannot fuse: it would sample the
 * pass INPUT rather than what the effects before it produced.
 */
import type { IUniform } from 'three'
import { isRecord } from '@shared/guards'
import { PRELUDE } from './shaders/postGlsl'

export type FusableKind = 'uv' | 'colour'

/**
 * `body` is a run of statements, not a function: a `uv` chunk assigns to `uv`, a `colour` chunk
 * to `colour`. Every identifier it declares is rewritten with a per-instance prefix, so two
 * graders in one stack do not collide.
 */
export type FusableChunk = {
  kind: FusableKind
  uniforms: Readonly<Record<string, IUniform>>
  /** Functions the body calls. Their names are rewritten like the uniforms'. */
  helpers?: readonly string[]
  body: string
}

/** What one fused pass draws, and the uniforms it was built with — one entry per instance. */
export type FusedShader = {
  fragmentShader: string
  uniforms: Record<string, IUniform>
  /** For each fused instance, in order, the map from its own name to the name in the shader. */
  naming: readonly Readonly<Record<string, string>>[]
}

/** Every identifier a helper declares, so calls to it are rewritten with its declaration. */
const HELPER_NAME = /(?:^|\s)(?:float|vec2|vec3|vec4|mat2|mat3|mat4|void)\s+([A-Za-z_]\w*)\s*\(/gu

function helperNamesIn(source: string): string[] {
  return [...source.matchAll(HELPER_NAME)].flatMap(match => (match[1] ? [match[1]] : []))
}

/**
 * ONE pass over the alternation rather than name by name: renaming `gain` then `gamma` in
 * sequence would rewrite the `gain` inside an already-renamed `fx0_gain`.
 */
function renamed(source: string, names: readonly string[], prefix: string): string {
  if (names.length === 0) return source
  const pattern = new RegExp(`\\b(${names.map(escapeName).join('|')})\\b`, 'gu')
  return source.replace(pattern, matched => `${prefix}${matched}`)
}

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** How a uniform's CURRENT value spells its type — the only description three gives us. */
function typeOf(uniform: IUniform): string {
  const value: unknown = uniform.value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'boolean' ? 'bool' : 'float'
  }
  if (isVectorLike(value, 'z')) return 'vec3'
  if (isVectorLike(value, 'y')) return 'vec2'
  if (isRecord(value) && 'r' in value) return 'vec3'
  return 'float'
}

function isVectorLike(value: unknown, last: string): boolean {
  return isRecord(value) && 'x' in value && last in value
}

/**
 * The order is the caller's, with one rule it has already applied: every `uv` chunk comes before
 * every `colour` chunk, there being exactly one fetch between them. A run needing a second is
 * split upstream — see `stepsOf`.
 */
export function fuseShader(chunks: readonly FusableChunk[]): FusedShader {
  const uniforms: Record<string, IUniform> = { tDiffuse: { value: null } }
  const declarations: string[] = []
  const helpers: string[] = []
  const beforeFetch: string[] = []
  const afterFetch: string[] = []
  const naming: Record<string, string>[] = []
  for (const [index, chunk] of chunks.entries()) {
    const prefix = `fx${index}_`
    const names = [...Object.keys(chunk.uniforms), ...(chunk.helpers ?? []).flatMap(helperNamesIn)]
    const map: Record<string, string> = {}
    for (const [name, uniform] of Object.entries(chunk.uniforms)) {
      map[name] = `${prefix}${name}`
      uniforms[map[name]] = uniform
      declarations.push(`uniform ${typeOf(uniform)} ${map[name]};`)
    }
    naming.push(map)
    for (const helper of chunk.helpers ?? []) helpers.push(renamed(helper, names, prefix))
    const body = renamed(chunk.body, names, prefix)
    ;(chunk.kind === 'uv' ? beforeFetch : afterFetch).push(`  {\n${body}\n  }`)
  }
  return {
    uniforms,
    naming,
    fragmentShader: `
uniform sampler2D tDiffuse;
${declarations.join('\n')}

varying vec2 vUv;

${PRELUDE}
${helpers.join('\n')}

void main() {
  vec2 uv = vUv;
  // What a coordinate chunk uses to say « nothing to read here » — a distortion pushing a corner
  // outside the source. A flag rather than an early return: there is one fetch for all of them.
  float mask = 1.0;
${beforeFetch.join('\n')}

  vec4 texel = texture2D(tDiffuse, clamp(uv, 0.0, 1.0));
  vec3 colour = texel.rgb * mask;
${afterFetch.join('\n')}

  gl_FragColor = vec4(max(colour, vec3(0.0)), texel.a);
}
`,
  }
}

import { describe, expect, it } from 'vitest'
import { POST_EFFECTS, POST_EFFECT_IDS, type PostParamSpec } from '@shared/domain/postProcessing'
import { numericBoundsOf } from '@shared/domain/propertySpec'
import { fusableFor } from './shaders/fusableChunks'
import { kuwaharaShader, radialBlurShader } from './shaders/standaloneShaders'
import { standaloneFor } from './standaloneEffects'

/**
 * The compiler already holds the partition — `STANDALONE_EFFECTS` is typed on
 * `Exclude<PostEffectId, FusedId | GpuOnlyEffectId>`. This says the same thing at RUNTIME, which
 * is what catches the two shapes a type cannot: a widened lookup that answers `undefined` where
 * the table has a key, and an id excluded from that table by a hand-written union while its
 * fiche says the Compatible engine builds it.
 */
describe('the two tables that give an effect its implementation', () => {
  /** The catalogue the Compatible engine has to answer for — the others have no GLSL to write. */
  const drawnByGl = POST_EFFECT_IDS.filter(id => POST_EFFECTS[id].engines.includes('gl'))

  it('covers every effect the Compatible engine claims, exactly once', () => {
    const uncovered = drawnByGl.filter(id => !fusableFor(id) && !standaloneFor(id))
    const twice = drawnByGl.filter(id => fusableFor(id) && standaloneFor(id))

    expect({ uncovered, twice }).toEqual({ uncovered: [], twice: [] })
  })

  /**
   * The other half of the same door: an effect the Compatible engine cannot build must be absent
   * from both tables. Left in one, it would draw under an engine its fiche says it cannot.
   */
  it('implements nothing the Compatible engine does not claim', () => {
    const strays = POST_EFFECT_IDS.filter(
      id => !POST_EFFECTS[id].engines.includes('gl') && (fusableFor(id) || standaloneFor(id)),
    )

    expect(strays).toEqual([])
  })

  it('builds a chunk with fresh uniforms each time, so two of one effect never collide', () => {
    const grade = fusableFor('colorGrading')
    const first = grade?.make().uniforms.exposure
    const second = grade?.make().uniforms.exposure

    expect(first).not.toBe(second)
  })

  /**
   * A chunk that writes `uv` runs BEFORE the single fetch; one that writes `colour` runs after.
   * Declared as the wrong half, a chunk that moves the coordinate compiles into a shader where
   * `uv` does not exist — a link error at the first draw, and nothing sooner.
   */
  it('declares every chunk that moves the coordinate as a uv chunk', () => {
    const misplaced = POST_EFFECT_IDS.filter(id => {
      const fusable = fusableFor(id)
      return (
        fusable !== undefined && /\buv\s*[-+]?=/.test(fusable.make().body) && fusable.kind !== 'uv'
      )
    })

    expect(misplaced).toEqual([])
  })
})

/**
 * GLSL ES 1.0 wants a CONSTANT loop bound, so a sampling shader breaks out of a fixed maximum on
 * a uniform. Raise the catalogue past that maximum and the extra samples are simply never taken:
 * the slider moves, the picture does not, and every gate stays green.
 */
describe('a sampling shader and the count its catalogue offers', () => {
  const boundOf = (source: string, name: string): number => {
    const found = new RegExp(`const int ${name} = (\\d+);`).exec(source)
    if (!found?.[1]) throw new Error(`${name} is not declared in that shader`)
    return Number(found[1])
  }

  /** Both are sliders, so both carry a maximum — an absent one is the case to fail on. */
  const askedFor = (spec: PostParamSpec | undefined): number => {
    const most = spec && numericBoundsOf(spec)?.max
    if (most === undefined) throw new Error('that parameter declares no maximum')
    return most
  }

  it('takes every sample the radial blur offers', () => {
    expect(boundOf(radialBlurShader.fragmentShader, 'MAX_TAPS')).toBeGreaterThanOrEqual(
      askedFor(POST_EFFECTS.radialBlur.params.samples),
    )
  })

  it('reaches every pixel the painterly radius offers', () => {
    expect(boundOf(kuwaharaShader.fragmentShader, 'MAX_RADIUS')).toBeGreaterThanOrEqual(
      askedFor(POST_EFFECTS.kuwahara.params.radius),
    )
  })
})

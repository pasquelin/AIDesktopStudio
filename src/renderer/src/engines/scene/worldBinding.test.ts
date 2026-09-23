import { describe, expect, it } from 'vitest'
import { ACESFilmicToneMapping, AgXToneMapping, Fog, FogExp2, NoToneMapping } from 'three'
import { applyFog, applyToneMapping, toneMappingOf } from './worldBinding'

describe('fog on a scene', () => {
  it('leaves nothing behind when turned off', () => {
    const scene = { fog: new Fog(0) }
    applyFog(scene, { kind: 'none' })

    expect(scene.fog).toBe(null)
  })

  it('reuses the object it already holds when only the numbers moved', () => {
    // Not a micro-optimisation: `scene.fog` appearing or vanishing changes the shader cache key,
    // so every material in the scene recompiles. A slider drag must not do that sixty times.
    const scene: { fog: Fog | FogExp2 | null } = { fog: null }
    applyFog(scene, { kind: 'linear', color: '#ffffff', near: 1, far: 2 })
    const built = scene.fog

    applyFog(scene, { kind: 'linear', color: '#000000', near: 5, far: 9 })

    expect(scene.fog).toBe(built)
    expect(scene.fog).toBeInstanceOf(Fog)
  })

  it('builds a new object when the form changes', () => {
    const scene: { fog: Fog | FogExp2 | null } = { fog: null }
    applyFog(scene, { kind: 'linear', color: '#ffffff', near: 1, far: 2 })
    applyFog(scene, { kind: 'exp2', color: '#ffffff', density: 0.05 })

    expect(scene.fog).toBeInstanceOf(FogExp2)
  })

  it('carries each form its own numbers', () => {
    const scene: { fog: Fog | FogExp2 | null } = { fog: null }

    applyFog(scene, { kind: 'linear', color: '#102030', near: 4, far: 40 })
    expect(scene.fog).toMatchObject({ near: 4, far: 40 })

    applyFog(scene, { kind: 'exp2', color: '#102030', density: 0.07 })
    expect(scene.fog).toMatchObject({ density: 0.07 })
  })
})

describe('tone mapping', () => {
  it('leaves the viewport as it has always drawn when the document says none', () => {
    expect(toneMappingOf('none')).toBe(NoToneMapping)
  })

  it('maps the curve a new scene opens on', () => {
    expect(toneMappingOf('agx')).toBe(AgXToneMapping)
  })

  it('writes the mapping and the exposure together', () => {
    const renderer = { toneMapping: NoToneMapping, toneMappingExposure: 1 }
    applyToneMapping(renderer, 'aces', 1.6)

    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)
    expect(renderer.toneMappingExposure).toBe(1.6)
  })

  it('keeps the exposure a document asked for even with no mapping', () => {
    // three.js reads `toneMappingExposure` regardless, so dropping it here would make the field
    // do nothing on exactly the setting every existing project opens with.
    const renderer = { toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }
    applyToneMapping(renderer, 'none', 2)

    expect(renderer.toneMappingExposure).toBe(2)
  })
})

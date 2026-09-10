import { describe, expect, it } from 'vitest'
import { VIEWPORT_QUALITIES } from '@shared/domain/scene'
import { budgetFor, samplesOf } from '../postfx/postQuality'
import { gpuBudgetFor, gpuSamplesOf } from './gpuPostQuality'

describe('what the Advanced chain is allowed to spend', () => {
  it('spends the whole frame at the top setting', () => {
    expect(gpuBudgetFor('high', 'high')).toEqual({ resolutionScale: 1, samples: 1, subpixel: true })
  })

  it('works the occlusion out at half the frame where the setting says so', () => {
    expect(gpuBudgetFor('high', 'performance').resolutionScale).toBe(0.5)
  })

  it('drops the temporal correction at the cheap end, the one lever TRAA has', () => {
    expect(gpuBudgetFor('high', 'performance').subpixel).toBe(false)
    expect(gpuBudgetFor('high', 'balanced').subpixel).toBe(true)
  })

  // 🛑 The point of the module: a setting has to buy the same thing on both engines, or the two
  // pictures cannot be compared and « Performance » means whichever chain happens to be running.
  it('answers the same reading as the Compatible chain, at every setting', () => {
    for (const quality of VIEWPORT_QUALITIES) {
      const gl = budgetFor('high', quality)
      const gpu = gpuBudgetFor('high', quality)

      expect(gpu.resolutionScale).toBe(1 / gl.divisor)
      expect(gpu.samples).toBe(gl.samples)
    }
  })

  it('brings a count down exactly as the Compatible chain does', () => {
    for (const quality of VIEWPORT_QUALITIES) {
      const asked = 16
      expect(gpuSamplesOf(asked, gpuBudgetFor('high', quality))).toBe(
        samplesOf(asked, budgetFor('high', quality)),
      )
    }
  })
})

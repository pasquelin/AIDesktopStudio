import { describe, expect, it } from 'vitest'
import { animationGraphOf } from './animationGraph'
import { ANIMATION_PRESET_IDS, animationGraphPreset } from './animationPresets'

describe('the graphs the studio ships', () => {
  it.each(ANIMATION_PRESET_IDS)('reads back what %s was written as', id => {
    const preset = animationGraphPreset(id)

    // 🛑 Through the parser and not merely typed: a preset is what a template WRITES to disk, and
    // one the reader refuses would land in a project as a file nothing can open.
    expect(animationGraphOf(structuredClone(preset))).toEqual(preset)
  })
})

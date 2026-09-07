import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ANIMATION_PRESET_IDS, animationGraphPreset } from '@shared/domain/animationPresets'
import { join } from 'node:path'
import { SOURCE_ROOT } from './sourceFiles'

/**
 * 🛑 Here rather than beside the presets: only this tree is typed against Node, and this is a
 * question about the DISK. A preset naming a folder nobody shipped leaves the character standing
 * in his rest pose, and no other gate would say a word.
 */
describe('the clips a shipped animation graph names', () => {
  it('are folders the app actually ships', () => {
    const shipped = new Set(
      readdirSync(join(SOURCE_ROOT, '..', 'resources', 'animations'), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name),
    )

    for (const id of ANIMATION_PRESET_IDS) {
      for (const layer of animationGraphPreset(id).layers) {
        for (const state of layer.states) {
          expect(state.source.kind).toBe('bundled')
          expect(shipped).toContain(state.source.name)
        }
      }
    }
  })
})

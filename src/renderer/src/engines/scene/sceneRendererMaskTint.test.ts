// @vitest-environment jsdom
import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { SceneRenderer } from './SceneRenderer'

/**
 * The painted-mask tint is workshop furniture like the grid: a capture, a film or a played scene
 * shows the terrain, never the stencil somebody painted to sculpt it by.
 */
function watched(tinted: boolean): { renderer: SceneRenderer; shown: boolean[] } {
  const renderer = new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel: async () => new Group(),
  })
  const shown: boolean[] = []
  let held = tinted
  renderer['relief'].showMaskTint = next => {
    shown.push(next)
    const was = held
    held = next
    return was
  }
  return { renderer, shown }
}

describe('the relief mask tint through a render', () => {
  it('hides the tint and puts back the one it found', () => {
    const { renderer, shown } = watched(true)

    renderer['hideWorkshop']()()

    expect(shown).toEqual([false, true])
    renderer.dispose()
  })

  it('leaves a tint that was already off alone, whatever the settings say', () => {
    const { renderer, shown } = watched(false)

    renderer['hideWorkshop']()()

    expect(shown).toEqual([false])
    renderer.dispose()
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 🛑 Read off the SOURCE, like `theme.test.ts` does: `windows.ts` builds real `BrowserWindow`s,
 * and what this holds is a decision about their chrome rather than anything a fake could answer.
 */
const source = readFileSync(new URL('./windows.ts', import.meta.url), 'utf8')

const bodyOf = (name: string): string => {
  const at = source.indexOf(`export function ${name}(`)
  return at < 0 ? '' : source.slice(at, source.indexOf('\n}\n', at))
}

describe('the chrome each window wears', () => {
  it('gives the game window NO title bar: what is judged there is a game, not a window', () => {
    expect(bodyOf('openGameWindow')).toContain("titleBarStyle: 'hidden'")
  })

  /** Without them nothing closes it with the mouse — `frame: false` would take them too. */
  it('keeps its traffic lights, and places them where the studio places its own', () => {
    expect(bodyOf('openGameWindow')).toContain('trafficLightPosition: TRAFFIC_LIGHTS')
  })

  /**
   * The video return shares `monitorWindow` and must NOT follow: it is put on a second screen
   * and filled, where a title bar is what one grabs to move it back.
   */
  it('leaves the video return alone, though the two share one builder', () => {
    expect(bodyOf('openMirrorWindow')).not.toContain('titleBarStyle')
  })
})

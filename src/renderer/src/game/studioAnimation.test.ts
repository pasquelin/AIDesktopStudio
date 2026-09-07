import { describe, expect, it, vi } from 'vitest'
import type { PosedClip } from '@game/ports/animationPort'
import { createStudioAnimation, type SceneAnimate } from './studioAnimation'

const clip: PosedClip = { key: 'walk', time: 0, weight: 1, part: 'all', rootMotion: 'inPlace' }

function viewport(): SceneAnimate & { released: string[] } {
  const released: string[] = []
  return {
    released,
    poseNode: vi.fn(),
    releaseNode: (nodeId: string) => void released.push(nodeId),
    clipLengthsOf: () => ({ walk: 1 }),
    useGraphClips: vi.fn(),
    seekClips: vi.fn(),
  }
}

describe('what poses a body inside the studio', () => {
  it('gives back every body it posed, once each', () => {
    const renderer = viewport()
    const port = createStudioAnimation(renderer)

    port.pose('hero', [clip])
    port.pose('guard', [clip])
    port.pose('hero', [clip])
    port.releaseAll()

    expect(renderer.released).toEqual(['hero', 'guard'])
  })

  /**
   * 🛑 What STOP rests on: it throws the engines away without disposing the world, so nothing runs
   * the animator's own `dispose` — a body left posed would keep its last playing pose.
   */
  it('holds nothing back after a release, so a second one asks for nothing', () => {
    const renderer = viewport()
    const port = createStudioAnimation(renderer)

    port.pose('hero', [clip])
    port.release('hero')
    port.releaseAll()

    expect(renderer.released).toEqual(['hero'])
  })

  it('poses nothing and answers no length with no viewport at all', () => {
    const port = createStudioAnimation(undefined)

    expect(() => port.pose('hero', [clip])).not.toThrow()
    // 🛑 An empty table reads as « the clip has not landed »: the machine holds its state and
    // shows nothing, rather than the game refusing to run.
    expect(port.lengths('hero')).toEqual({})
    expect(() => port.releaseAll()).not.toThrow()
  })
})

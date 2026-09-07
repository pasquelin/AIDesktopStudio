import { describe, expect, it } from 'vitest'
import { canvasHostStub } from '@/stores/canvas-fixtures'
import { canvasHost, holdCanvas, type CanvasHost } from './canvasHosts'

const engine = (label: string): CanvasHost =>
  canvasHostStub({
    pixelSnapshots: async () => [{ layerId: label, mask: false, data: new Uint8Array(0) }],
    snapshot: async () => label,
  })

describe('the canvas host registry', () => {
  it('finds nothing for a document nobody registered', () => {
    expect(canvasHost('absent')).toBeNull()
  })

  it('hands back the engine holding a document', async () => {
    const held = engine('one')
    const release = holdCanvas('doc-1', () => held)

    expect(await canvasHost('doc-1')?.pixelSnapshots()).toEqual([
      { layerId: 'one', mask: false, data: new Uint8Array(0) },
    ])
    release()
  })

  /**
   * The reason the entry is a function and not the engine itself: a save can land after the tab
   * was remounted, and it is the engine holding the textures now that must answer.
   */
  it('reads the engine at call time, not at registration', async () => {
    let live = engine('first')
    const release = holdCanvas('doc-1', () => live)
    live = engine('second')

    expect(await canvasHost('doc-1')?.pixelSnapshots()).toEqual([
      { layerId: 'second', mask: false, data: new Uint8Array(0) },
    ])
    release()
  })

  it('forgets the document when its editor goes', () => {
    const release = holdCanvas('doc-1', () => engine('one'))
    release()

    expect(canvasHost('doc-1')).toBeNull()
  })

  /**
   * React runs the new effect before the old cleanup on a remount. A release that fired blindly
   * would drop the entry the live editor had just written, and the document would save no pixels.
   */
  it('leaves a re-registered document alone when the previous editor releases', () => {
    const first = holdCanvas('doc-1', () => engine('first'))
    holdCanvas('doc-1', () => engine('second'))
    first()

    expect(canvasHost('doc-1')).not.toBeNull()
  })
})

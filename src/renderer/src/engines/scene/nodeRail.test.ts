import { describe, expect, it } from 'vitest'
import { DEFAULT_PATH } from '@shared/domain/scene'
import { meshNode, pathNode } from './nodeFactory'
import { railOf } from './nodeRail'

describe('railOf', () => {
  it('reads the rail a node IS', () => {
    expect(railOf(pathNode())).toEqual(DEFAULT_PATH)
  })

  /** 🛑 The band and the rail answer the same way, or its knobs would be drawn and not movable. */
  it('reads the rail a band is swept along', () => {
    const band = meshNode({
      kind: 'ribbon',
      path: { ...DEFAULT_PATH, closed: true },
      width: 1,
      height: 0.2,
      segments: 16,
    })

    expect(railOf(band)?.closed).toBe(true)
  })

  it('answers nothing for a shape that carries none', () => {
    expect(railOf(meshNode({ kind: 'box', width: 1, height: 1, depth: 1 }))).toBeNull()
    expect(railOf(undefined)).toBeNull()
  })
})

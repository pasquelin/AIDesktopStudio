import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStudio, type Studio } from './studio'
import type { Run } from './run'
import { refusedWith } from './oracleActions'

let studio: Studio

const runWith = (answer: string): Run => ({
  studio,
  called: [{ action: 'node.add', input: { kind: 'box' }, answer }],
  refused: 1,
  said: '',
  asks: [],
})

beforeEach(async () => {
  studio = await createStudio([])
})

afterEach(() => studio.close())

describe('an oracle expecting a precise refusal', () => {
  it('accepts the expected reason with its corrective detail', () => {
    expect(
      refusedWith(
        runWith('refused wrongSurface (open the model in a scene to edit nodes)'),
        'node.add',
        'wrongSurface',
        'open the model in a scene',
      ),
    ).toBe(true)
  })

  it('rejects another refusal reason', () => {
    expect(refusedWith(runWith('refused badInput'), 'node.add', 'wrongSurface')).toBe(false)
  })

  it('rejects the right reason when its corrective detail is absent', () => {
    expect(
      refusedWith(
        runWith('refused wrongSurface (the model cannot be edited here)'),
        'node.add',
        'wrongSurface',
        'open the model in a scene',
      ),
    ).toBe(false)
  })
})

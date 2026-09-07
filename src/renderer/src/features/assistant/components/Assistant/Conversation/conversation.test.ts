import { describe, expect, it } from 'vitest'
import { HISTORY_BLOCK_MAX } from '@shared/domain/assistant'
import {
  alreadySettled,
  assistantHistory,
  repeatedRelative,
  RESULT_MAX,
  resultLine,
  repeatKeyOf,
  settledKeyOf,
  type AssistantStep,
  type AssistantTurn,
} from './conversation'

const turn = (fields: Partial<AssistantTurn> = {}): AssistantTurn => ({
  id: 1,
  said: 'ouvre un fichier 3D',
  answered: '',
  steps: [],
  asks: [],
  lost: false,
  ...fields,
})

describe('the conversation the model reads', () => {
  /** The API takes ten blocks. A block per line would spend the budget on two exchanges. */
  it('folds a whole turn into one block, whatever the turn holds', () => {
    const blocks = assistantHistory([
      turn({
        id: 1,
        answered: 'J’ouvre un fichier 3D.',
        steps: [
          { action: 'workspace.open', refusal: null },
          { action: 'models.search', refusal: null },
        ],
      }),
      turn({ id: 2, said: 'et maintenant génère' }),
    ])

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('ouvre un fichier 3D')
    expect(blocks[0]).toContain('workspace.open')
    expect(blocks[0]).toContain('models.search')
    expect(blocks[1]).toContain('et maintenant génère')
  })

  /**
   * 🛑 What makes the chain WAIT worth anything: without this the answer never reaches the round
   * that asked for it. ONE line for the pair — see `blockWithin`.
   */
  it('carries what was asked and what came back, on one line', () => {
    const [block] = assistantHistory([
      turn({ asks: [{ question: 'Quel nom ?', answer: 'Bateaux', note: 'court' }] }),
    ])

    expect(block).toContain('You asked: Quel nom ? — the person answered: Bateaux (court)')
  })

  /**
   * 🛑 Left BLANK and let GO read differently: one chain carries on, the other stops, and told
   * the same sentence a model has no reason to do either.
   */
  it('tells a question left blank from a card let go', () => {
    const [blank] = assistantHistory([turn({ asks: [{ question: 'Lequel ?', answer: null }] })])
    const [gone] = assistantHistory([
      turn({ asks: [{ question: 'Lequel ?', answer: null, dismissed: true }] }),
    ])

    expect(blank).toContain('You asked: Lequel ? — the person left it blank.')
    expect(gone).toContain('You asked: Lequel ? — the person dismissed the question.')
  })

  /** 🛑 A question that offered a note and got nothing else is one answered by its note alone. */
  it('carries a note written where nothing was pressed', () => {
    const [block] = assistantHistory([
      turn({ asks: [{ question: 'Pourquoi ?', answer: null, note: 'pour un test' }] }),
    ])

    expect(block).toContain('the person left it blank (pour un test).')
  })

  /**
   * 🛑 The pair travels together or NOT AT ALL. Written as two lines, a question past the bound
   * was cut while its answer stayed, and the round read « the person answered: Bateaux » with
   * nothing saying what had been asked.
   */
  it('drops a question too long to keep along with its answer', () => {
    const [block] = assistantHistory([
      turn({ asks: [{ question: 'q'.repeat(50_000), answer: 'Bateaux' }] }),
    ])

    expect(block).not.toContain('Bateaux')
    expect(block).toContain('not shown')
  })

  /**
   * The suite runs in French — `testSetup` says so — which is what makes this worth asserting:
   * a studio running in French must not have the model decide differently from one running in
   * English.
   */
  it('states a refusal in English, whatever the studio is running in', () => {
    const [block] = assistantHistory([
      turn({ steps: [{ action: 'generator.submit', refusal: 'declined' }] }),
    ])

    expect(block).toContain('You turned that action down.')
  })

  // A turn showing as nothing at all has the model repeat the sentence it already failed on.
  it('says so when a turn came to nothing', () => {
    const [block] = assistantHistory([turn({ lost: true })])

    expect(block).toContain('did not manage to answer')
  })
})

/**
 * What an action ANSWERED, which is what makes a chain possible: without it the model has run a
 * search and cannot open what it found. Bounded, because a project listing is thousands of
 * entries and the whole briefing has some eight thousand characters to live in.
 */
describe('what a step answered, as the model reads it', () => {
  it('carries the answer beside the action, so the next round can use it', () => {
    const [block] = assistantHistory([
      turn({ steps: [{ action: 'files.search', refusal: null, data: ['Images/Voilier.png'] }] }),
    ])

    expect(block).toContain('files.search')
    expect(block).toContain('Images/Voilier.png')
  })

  /**
   * 🛑 Where a chain stalls: `0 results: []` reads as an answer, and the model reported it to the
   * person and stopped — three times over, asking to be allowed to list the folder it could have
   * listed. Named in words at the moment the model decides, not in a briefing.
   */
  it('says an empty answer in words rather than in brackets', () => {
    const [block = ''] = assistantHistory([
      turn({ steps: [{ action: 'files.search', refusal: null, data: [] }] }),
    ])

    expect(block).toContain('nothing matched')
    // No instruction with it: `jobs.list` answers empty for a job not yet registered, and a
    // "try another way" there would stop a model from watching its own generation.
    expect(block).not.toContain('another way')
  })

  /**
   * 🛑 Dropped by WHOLE entries and counted: half a path is a path the model calls with, and a
   * call on half a path opens nothing. A model told nothing of what was cut plans against a
   * project half of which it cannot see.
   */
  it('cuts a long list by entries and says how many it did not show', () => {
    const many = [...Array(300).keys()].map(at => `Images/asset_${at}.png`)
    const [block] = assistantHistory([
      turn({ steps: [{ action: 'files.search', refusal: null, data: many }] }),
    ])

    expect(block).toContain('300 results')
    expect(block).toMatch(/and \d+ more, not shown/)
    // Never a broken entry at the cut: every path quoted is one the model may call with.
    expect(block).not.toMatch(/Images\/asset_\d+\.pn"/)
  })

  // A chain cut at its ceiling reads exactly like one that finished — to the model too, which
  // would take a half-done job for a done one and answer the next sentence against it.
  it('tells the model a chain was cut rather than finished', () => {
    const [halted] = assistantHistory([turn({ ending: 'halted' })])
    const [stopped] = assistantHistory([turn({ ending: 'stopped' })])

    expect(halted).toContain('too many rounds')
    expect(stopped).toContain('stopped you')
  })
})

/**
 * 🛑 A chain writes into ONE block, which grows at every round — and a block past the boundary's
 * bound is refused WHOLE: `parseThought` throws, the window reads nothing back, and a chain that
 * was working dies as "I did not manage to answer that one". Measured at 16 260 characters for
 * twelve rounds of two acting calls, against a bound of ten thousand.
 */
describe('a block long enough to be refused', () => {
  const long = (steps: number): AssistantTurn =>
    turn({
      steps: [...Array(steps).keys()].map((at): AssistantStep => ({
        action: 'files.search',
        refusal: null,
        data: [...Array(20).keys()].map(one => `Images/asset_${at}_${one}.png`),
      })),
    })

  it('cuts it to what the boundary takes, keeping the sentence and the latest steps', () => {
    const [block = ''] = assistantHistory([long(40)])

    expect(block.length).toBeLessThanOrEqual(HISTORY_BLOCK_MAX)
    expect(block).toContain('ouvre un fichier 3D')
    // The LAST steps are the ones a round is about to build on.
    expect(block).toContain('asset_39_')
    expect(block).toContain('earlier steps not shown')
  })

  // A model that cannot tell a block was cut plans against steps it believes never ran.
  it('leaves a short block untouched', () => {
    const [block = ''] = assistantHistory([long(1)])

    expect(block).not.toContain('earlier steps not shown')
  })
})

// The measure this answers is on `repeatKeyOf`.
describe('a relative call sent twice in one turn', () => {
  const call = { nodeId: 'n-1', rotationY: 0.35, relative: true }

  it('is keyed only when the change is relative', () => {
    expect(repeatKeyOf('node.transform', call)).toBeTruthy()
    expect(repeatKeyOf('node.transform', { nodeId: 'n-1', rotationY: 0.35 })).toBeNull()
  })

  /**
   * 🛑 The FIGURE is not part of the key: a second relative change to the same field lands on top
   * of the first whatever it carries, and a model correcting its own arithmetic sends another.
   */
  it('keys the same field of the same thing alike, whatever figure it carries', () => {
    expect(repeatKeyOf('node.transform', { ...call, rotationY: 2 })).toBe(
      repeatKeyOf('node.transform', call),
    )
  })

  it('keys another field, another thing and another action apart', () => {
    const key = repeatKeyOf('node.transform', call)

    expect(
      repeatKeyOf('node.transform', { nodeId: 'n-1', positionX: 0.35, relative: true }),
    ).not.toBe(key)
    expect(
      repeatKeyOf('node.transform', { nodeId: 'n-2', rotationY: 0.35, relative: true }),
    ).not.toBe(key)
    expect(repeatKeyOf('node.setLightSettings', call)).not.toBe(key)
  })

  it('is seen as already run, and only once it has actually run', () => {
    const key = repeatKeyOf('node.transform', call)
    const step = (refusal: AssistantStep['refusal']): AssistantStep => ({
      action: 'node.transform',
      refusal,
      repeatKey: key ?? '',
    })
    const ran = [step(null)]
    const missed = [step('badInput')]

    expect(repeatedRelative(ran, key)).toBe(true)
    expect(repeatedRelative(missed, key)).toBe(false)
    expect(repeatedRelative([], key)).toBe(false)
  })
})

describe('a call that sets a named state, sent twice in one turn', () => {
  it('is keyed for what sets a state, and for nothing that reads or edits', () => {
    expect(settledKeyOf('panel.open', { panel: 'projects' })).toBeTruthy()
    expect(settledKeyOf('jobs.list', {})).toBeNull()
    expect(settledKeyOf('layer.add', { name: 'ciel' })).toBeNull()
  })

  // What a JSON round trip does not preserve, and a model rewriting its own call would hit.
  it('keys the same call written in either order to one string', () => {
    expect(settledKeyOf('document.open', { path: 'a.ora', space: 'image' })).toBe(
      settledKeyOf('document.open', { space: 'image', path: 'a.ora' }),
    )
  })

  it('is seen as already set, and only once it has actually run', () => {
    const key = settledKeyOf('panel.open', { panel: 'projects' })
    const step = (refusal: AssistantStep['refusal']): AssistantStep => ({
      action: 'panel.open',
      refusal,
      settledKey: key ?? '',
    })

    expect(alreadySettled([step(null)], 'panel.open', key)).toBe(true)
    expect(alreadySettled([step('wrongSurface')], 'panel.open', key)).toBe(false)
    expect(alreadySettled([], 'panel.open', key)).toBe(false)
  })

  /** Keyed on the INPUT: two different panels brought up is a plan, not a loop. */
  it('leaves another panel of the same action through', () => {
    const opened = settledKeyOf('panel.open', { panel: 'projects' })
    const step: AssistantStep = { action: 'panel.open', refusal: null, settledKey: opened ?? '' }

    expect(
      alreadySettled([step], 'panel.open', settledKeyOf('panel.open', { panel: 'layers' })),
    ).toBe(false)
  })

  /** The plan a naive guard would have cut: arm A, act, arm B, act, come back to A. */
  it('lets a turn come back to a state it set before another', () => {
    const first = settledKeyOf('layer.select', { layerId: 'a' })
    const between = settledKeyOf('layer.select', { layerId: 'b' })
    const steps: AssistantStep[] = [
      { action: 'layer.select', refusal: null, settledKey: first ?? '' },
      { action: 'layer.setOpacityBlendAndVisibility', refusal: null },
      { action: 'layer.select', refusal: null, settledKey: between ?? '' },
    ]

    expect(alreadySettled(steps, 'layer.select', first)).toBe(false)
    expect(alreadySettled(steps, 'layer.select', between)).toBe(true)
  })
})

/**
 * 🛑 An answer past the ceiling is cut by whole MEMBERS, never mid-value: `scene.state` runs long,
 * and the character cut handed the model `8edfaabe-0ebd…` as a row id — three calls refused on an
 * id that was never whole, measured 2026-08-31.
 */
describe('an object answer too long to show whole', () => {
  const LONG = 'x'.repeat(RESULT_MAX + 100)

  it('keeps the members that fit whole and names the one it dropped', () => {
    const shown = resultLine({ id: 'abc-123', bulk: LONG, cues: ['fade-1'] })

    expect(shown).toContain('"id":"abc-123"')
    expect(shown).toContain('cut short: bulk')
    // The point of the whole thing: no value is handed over half written.
    expect(shown).not.toContain('xxx…')
  })

  /**
   * 🛑 `scene.state` publishes `nodes`, the only place a node id is ever answered. Dropped whole,
   * the assistant could not name one object of the scene in front of it.
   */
  it('gives what fits of a list too long to show whole, and says how many', () => {
    // Counted off the ceiling at the ~20 characters an entry costs: a fixed 40 entries stopped
    // overrunning it the day it was raised.
    const many = Math.ceil(RESULT_MAX / 20)
    const nodes = Array.from({ length: many }, (_, at) => ({
      id: `node-${at}`,
      name: `Cube ${at}`,
    }))

    const shown = resultLine({ id: 'abc-123', nodes })

    expect(shown).toContain('"id":"node-0"')
    expect(shown).toContain(`of ${many})`)
    // Never half an item: an id cut in two is an id every later call is refused on.
    expect(shown).not.toMatch(/"id":"node-\d+$/)
  })

  // A member that is not there is not a member answered `null`.
  it('leaves an absent member out rather than writing it null', () => {
    expect(resultLine({ id: 'abc-123', missing: undefined, bulk: LONG })).not.toContain('null')
  })

  it('leaves an answer that fits exactly as it is', () => {
    expect(resultLine({ id: 'abc-123' })).toBe('{"id":"abc-123"}')
  })
})

import { describe, expect, it } from 'vitest'
import { missionFailureClassOf, type MissionFailureEvidence } from './missionFailures'
import type { Called } from './run'

const evidence = (over: Partial<MissionFailureEvidence>): MissionFailureEvidence => ({
  expected: ['node.add'],
  candidates: new Set(['node.add', 'scene.state']),
  called: [{ action: 'node.add', input: { kind: 'box' }, answer: 'ok' }],
  missionStates: ['completed'],
  ...over,
})

describe('classifying a failed mission run', () => {
  it('blames the retrieval only when the expected action was never offered', () => {
    expect(
      missionFailureClassOf(
        evidence({
          candidates: new Set(['scene.state']),
          called: [{ action: 'scene.state', input: {}, answer: 'ok' }],
        }),
      ),
    ).toBe('expected-outside-candidates')
    expect(
      missionFailureClassOf(
        evidence({ called: [{ action: 'scene.state', input: {}, answer: 'ok' }] }),
      ),
    ).toBe('expected-not-called')
  })

  it('reads the runtime state before the calls', () => {
    expect(missionFailureClassOf(evidence({ missionStates: ['failed'] }))).toBe('runtime-failed')
    expect(missionFailureClassOf(evidence({ missionStates: ['waiting_user'] }))).toBe(
      'question-asked',
    )
    expect(missionFailureClassOf(evidence({ called: [] }))).toBe('no-call')
  })

  it('tells a refusal from a repeated call from an oracle that simply said no', () => {
    const add: Called = { action: 'node.add', input: { kind: 'box' }, answer: 'ok' }
    expect(
      missionFailureClassOf(evidence({ called: [{ ...add, answer: 'refused badInput' }] })),
    ).toBe('refused')
    expect(missionFailureClassOf(evidence({ called: [add, add] }))).toBe('duplicate-call')
    expect(missionFailureClassOf(evidence({}))).toBe('oracle')
  })
})

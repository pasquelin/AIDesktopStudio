import { describe, expect, it, vi } from 'vitest'
import { ACTION_REGISTRY, assistantAction, type ActionName } from '@shared/domain/assistant'
import { answeredTurn } from './brainTurn'
import { briefingFor } from './instruction'
import { actionBlock } from './instructionCatalogue'

const manualOf = (name: ActionName): string => {
  const action = assistantAction(name)
  if (!action) throw new Error(`${name} is not registered`)
  return actionBlock(action)
}

describe('mission briefing', () => {
  it('names every action and opens the manuals of the candidates alone', async () => {
    const briefing = await briefingFor(
      { utterance: 'create', history: [], candidates: ['project.create'] },
      200_000,
    )

    for (const action of ACTION_REGISTRY) {
      expect(briefing.text.includes(action.name), action.name).toBe(true)
    }
    expect(briefing.text).toContain(manualOf('project.create'))
    expect(briefing.text).not.toContain(manualOf('git.checkout'))
    expect(briefing.loaded).toEqual(['project.create'])
  })

  it('prints a repeated field as a list, so the model sends one', () => {
    expect(manualOf('node.combineIntoSolid')).toContain('nodeIds (list of text, required)')
    expect(manualOf('node.rename')).toContain('nodeId (text, required)')
  })

  it('tells the model how to read the mission JSON, and only on a mission', async () => {
    const mission = await briefingFor(
      { utterance: 'create', history: [], context: '{"mission":{}}', mission: true },
      200_000,
    )
    const conversation = await briefingFor(
      { utterance: 'create', history: [], context: 'a project about boats' },
      200_000,
    )

    expect(mission.text).toContain('Mission:\n{"mission":{}}')
    expect(mission.text).toContain('previousResults lists what already RAN')
    expect(conversation.text).toContain('Project context:\na project about boats')
    expect(conversation.text).not.toContain('previousResults')
  })

  it('tells a continuing round to build on what already ran', async () => {
    const briefing = await briefingFor(
      { utterance: 'create', history: [], continuing: true, mission: true },
      200_000,
    )

    expect(briefing.text).toContain('never redo a call that')
  })

  it('opens what a discovery query finds', async () => {
    const briefing = await briefingFor(
      { utterance: 'create', history: [], candidates: ['project.create'] },
      200_000,
    )
    const expanded = briefing.expand?.('git checkout')

    expect(expanded?.loaded).toContain('git.checkout')
    expect(expanded?.text).toContain(manualOf('git.checkout'))
  })

  it('uses the caller search service for mission discovery', async () => {
    const discover = vi.fn(async (): Promise<readonly ActionName[]> => ['git.checkout'])
    const briefing = await briefingFor(
      { utterance: 'switch branch', history: [], candidates: ['project.create'] },
      200_000,
    )
    const round = vi
      .fn()
      .mockResolvedValueOnce({
        answer:
          '{"say":"","ask":null,"calls":[{"action":"actions.find","input":{"query":"switch branch"}}]}',
        cost: 1,
      })
      .mockResolvedValueOnce({
        answer:
          '{"say":"Done.","ask":null,"calls":[{"action":"git.checkout","input":{"branch":"main"}}]}',
        cost: 1,
      })

    const answer = await answeredTurn(briefing, round, undefined, undefined, discover)

    expect(discover).toHaveBeenCalledWith('switch branch')
    expect(answer.calls[0]?.action).toBe('git.checkout')
  })

  it('executes a call with no fields straight away, whether its manual is open or not', async () => {
    const briefing = await briefingFor(
      { utterance: 'move the sphere above the cube', history: [], candidates: ['node.transform'] },
      200_000,
    )
    const answer =
      '{"say":"","ask":null,"calls":[{"action":"scene.state","input":{}},' +
      '{"action":"node.transform","input":{"nodeId":"a","positionY":1}}]}'
    const round = vi.fn(async () => ({ answer, cost: 1 }))

    const result = await answeredTurn(briefing, round)

    expect(round).toHaveBeenCalledTimes(1)
    expect(result.calls.map(call => call.action)).toEqual(['scene.state', 'node.transform'])
  })

  it('opens the manual of an action named outside the candidates before executing it', async () => {
    const briefing = await briefingFor(
      { utterance: 'use the first project asset', history: [], candidates: ['project.create'] },
      200_000,
    )
    const answer =
      '{"say":"Searching.","ask":null,"calls":' +
      '[{"action":"assets.searchProjectCatalogue","input":{"query":"skybox"}}]}'
    const round = vi.fn(async () => ({ answer, cost: 1 }))

    const result = await answeredTurn(briefing, round)

    expect(round).toHaveBeenCalledTimes(2)
    expect(result.calls).toEqual([
      { action: 'assets.searchProjectCatalogue', input: { query: 'skybox' } },
    ])
    expect(result.loaded).toContain('assets.searchProjectCatalogue')
    expect(result.cost).toBe(2)
  })
})

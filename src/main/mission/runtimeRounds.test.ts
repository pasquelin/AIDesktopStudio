import { describe, expect, it } from 'vitest'
import type { ActionOutcome, AssistantCall } from '@shared/domain/assistant'
import {
  missionTestBrain as brainWith,
  missionTestRuntime as runtimeWith,
} from './runtimeTestSupport'

describe('mission runtime rounds after the first', () => {
  it('tells the brain it is continuing once an action has run, whatever it answered', async () => {
    const { brain, requests } = brainWith([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])

    await runtimeWith(brain).runtime.create('Create a project', {})

    expect(requests.map(request => request.continuing === true)).toEqual([false, true])
    expect(requests.every(request => request.mission === true)).toBe(true)
  })

  it('plans again rather than verifying after a read, which engages nothing', async () => {
    const { brain } = brainWith([
      { say: '', calls: [{ action: 'files.search', input: { query: 'boat' } }], cost: 0 },
      { say: 'Nothing to duplicate.', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Duplicate the boat', {})

    expect(mission.plan.steps.map(step => step.kind)).toEqual(['reason', 'action', 'reason'])
  })

  it('asks a verifying round to plan on rather than to confirm', async () => {
    const { brain, requests } = brainWith([
      { say: '', calls: [{ action: 'project.create', input: {} }], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Create a project', {})

    expect(mission.plan.steps.map(step => step.kind)).toEqual(['reason', 'action', 'verify'])
    expect(requests[1]?.utterance).toContain('plan the next calls if it is not')
  })

  it('verifies after a mutation that asks no confirmation, rather than planning it again', async () => {
    const { brain, requests } = brainWith([
      {
        say: '',
        calls: [{ action: 'node.markAsCuttingTool', input: { nodeIds: ['a'] } }],
        cost: 0,
      },
      { say: 'Done.', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Take the tool mark off', {})

    expect(mission.plan.steps.map(step => step.kind)).toEqual(['reason', 'action', 'verify'])
    expect(requests[1]?.utterance).toContain('Verify from the current state')
  })

  it('lets a model send the same mutation twice across rounds', async () => {
    const move: AssistantCall = { action: 'node.transform', input: { nodeId: 'a', positionY: 1 } }
    const { brain } = brainWith([
      { say: '', calls: [move], cost: 0 },
      { say: '', calls: [move], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Move it up twice', {})

    expect(mission.state).toBe('completed')
    expect(mission.plan.steps.filter(step => step.kind === 'action')).toHaveLength(2)
  })

  it('stops a model that sends the same reads a third round running', async () => {
    const search: AssistantCall = { action: 'files.search', input: { query: 'boat' } }
    const { brain, requests } = brainWith([
      { say: '', calls: [search], cost: 0 },
      { say: '', calls: [search], cost: 0 },
      { say: '', calls: [search], cost: 0 },
      { say: 'never asked', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Find the boat', {})

    expect(mission.state).toBe('failed')
    expect(requests).toHaveLength(3)
    expect(mission.plan.steps.at(-1)?.error).toBe(
      'the model repeats the reads or refused calls of its previous round',
    )
  })

  it('verifies after a round that mutated, even when a read closed it', async () => {
    const { brain } = brainWith([
      {
        say: '',
        calls: [
          { action: 'node.add', input: { kind: 'sphere' } },
          { action: 'scene.state', input: {} },
        ],
        cost: 0,
      },
      { say: 'Done.', calls: [], cost: 0 },
    ])

    const mission = await runtimeWith(brain).runtime.create('Duplicate the sphere', {})

    expect(mission.plan.steps.map(step => step.kind)).toEqual([
      'reason',
      'action',
      'action',
      'verify',
    ])
  })

  it('hands a failed refusal back to the model rather than failing the mission', async () => {
    const wrong: AssistantCall = { action: 'asset.extractTextures', input: { assetId: 'a path' } }
    const right: AssistantCall = { action: 'asset.extractTextures', input: { assetId: 'asset-7' } }
    const { brain, requests } = brainWith([
      { say: '', calls: [wrong], cost: 0 },
      { say: '', calls: [right], cost: 0 },
      { say: 'Done.', calls: [], cost: 0 },
    ])
    const run = async (call: AssistantCall): Promise<ActionOutcome> =>
      call.input['assetId'] === 'asset-7'
        ? { ok: true, data: [] }
        : { ok: false, refusal: 'failed', detail: 'asset a path is not a mesh' }

    const mission = await runtimeWith(brain, { actions: { run, settle: () => {} } }).runtime.create(
      'Open the texture',
      {},
    )

    expect(mission.state).toBe('completed')
    expect(requests).toHaveLength(3)
    expect(JSON.stringify(requests[1]?.context)).toContain('asset a path is not a mesh')
  })

  it('stops a model that resends a refused call unchanged a third time', async () => {
    const fold: AssistantCall = { action: 'node.combineIntoSolid', input: { nodeIds: 'a,b' } }
    const { brain, requests } = brainWith([
      { say: '', calls: [fold], cost: 0 },
      { say: '', calls: [fold], cost: 0 },
      { say: '', calls: [fold], cost: 0 },
      { say: 'never asked', calls: [], cost: 0 },
    ])
    const run = async (): Promise<ActionOutcome> => ({ ok: false, refusal: 'badInput' })

    const mission = await runtimeWith(brain, { actions: { run, settle: () => {} } }).runtime.create(
      'Cut the wall',
      {},
    )

    expect(mission.state).toBe('failed')
    expect(requests).toHaveLength(3)
  })

  it('fails the mission on an answer nothing could be read from', async () => {
    const { brain } = brainWith([{ say: '', calls: [], unreadable: true, cost: 0 }])

    const mission = await runtimeWith(brain).runtime.create('Create a project', {})

    expect(mission.state).toBe('failed')
    expect(mission.plan.steps[0]?.error).toBe('the model answered nothing readable')
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { MissionStep } from '@shared/domain/mission'
import type { VisualContext } from './context'
import { createAssistantContextBuilder } from './contextBuilder'
import { clock, dependencies, missionOf, snapshotOf } from './contextBuilder-fixtures'

describe('AssistantContextBuilder budgets', () => {
  it('keeps a scene selection bounded and prioritises results required by the current step', async () => {
    const base = missionOf('/projects/alpha')
    const earlier: MissionStep = {
      ...base.step,
      id: 'step_earlier',
      kind: 'action',
      call: { action: 'scene.state', input: {} },
      state: 'completed',
      result: { value: 1 },
    }
    const needed: MissionStep = {
      ...base.step,
      id: 'step_needed',
      kind: 'action',
      call: { action: 'files.list', input: { folder: 'Images' } },
      state: 'completed',
      result: { value: 'needed'.repeat(2_000) },
    }
    const step = { ...base.step, dependsOn: [needed.id] }
    const mission = { ...base.mission, plan: { steps: [earlier, needed, step] } }
    const scene = snapshotOf()
    scene.workspace = '3d'
    scene.surface = '3d'
    scene.documents[0] = {
      ...scene.documents[0]!,
      kind: 'scene',
      workspace: '3d',
      path: 'documents/Boat.gltf',
    }
    scene.selection = {
      kind: 'node',
      items: Array.from({ length: 12 }, (_, at) => ({ id: `node_${at}`, name: `Node ${at}` })),
    }
    const builder = createAssistantContextBuilder(dependencies({ snapshot: async () => scene }))
    const context = await builder.build({ mission, step, request: 'Move the selected nodes' })
    expect(context.document?.kind).toBe('scene')
    expect(context.selection?.items).toHaveLength(8)
    expect(context.previousResults[0]?.stepId).toBe('step_needed')
    expect(context.previousResults[0]?.call).toEqual({
      action: 'files.list',
      input: { folder: 'Images' },
    })
    expect(context.previousResults[0]?.result).toMatchObject({ truncated: true })
    expect(context.budget.results.contentTruncated).toBe(true)
    expect(context.budget.selection.truncated).toBe(true)
  })

  it('shows the reads of the round that just ran whole, and compacts the older ones', async () => {
    const base = missionOf('/projects/alpha')
    const read = (id: string): MissionStep => ({
      ...base.step,
      id,
      kind: 'action',
      call: { action: 'scene.state', input: {} },
      state: 'completed',
      result: { nodes: Array.from({ length: 60 }, (_, at) => ({ id: `node_${at}`, x: at })) },
    })
    const earlier = read('step_earlier')
    const between: MissionStep = { ...base.step, id: 'step_between', state: 'completed' }
    const latest = read('step_latest')
    const step = { ...base.step, id: 'step_now', dependsOn: [latest.id] }
    const mission = { ...base.mission, plan: { steps: [earlier, between, latest, step] } }
    const builder = createAssistantContextBuilder(dependencies())

    const context = await builder.build({ mission, step, request: 'Place the sphere' })

    expect(context.previousResults.map(one => one.stepId)).toEqual(['step_latest', 'step_earlier'])
    expect(context.previousResults[0]?.result).toEqual(latest.result)
    expect(context.previousResults[1]?.result).toMatchObject({ truncated: true })
  })

  it('ranks relevant project cards before applying their independent budget', async () => {
    const { mission, step } = missionOf('/projects/alpha')
    const cards = Array.from({ length: 9 }, (_, at) => ({
      id: `card_${at}`,
      title: at === 8 ? 'Boat palette' : `Unrelated ${at}`,
      body: 'x'.repeat(120),
      active: true,
      pictures: [],
    }))
    const builder = createAssistantContextBuilder(
      dependencies({ projectContext: { read: async () => ({ cards, trouble: null }) } }),
    )
    const context = await builder.build({ mission, step, request: 'boat colors' })
    expect(context.projectContext?.cards[0]?.id).toBe('card_8')
    expect(context.budget.projectContext.truncated).toBe(true)
  })

  it('captures visual context only when requested and keeps its byte budget independent', async () => {
    const { mission, step } = missionOf('/projects/alpha')
    const capture = vi.fn(async (): Promise<VisualContext> => ({
      kind: 'document',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      bytes: new Uint8Array([1, 2, 3]),
      capturedAt: clock.now(),
    }))
    const builder = createAssistantContextBuilder(dependencies({ visual: capture }))

    expect((await builder.build({ mission, step, request: 'Continue' })).visual).toBeUndefined()
    const context = await builder.build({ mission, step, request: 'Inspect it', visual: true })

    expect(capture).toHaveBeenCalledTimes(1)
    expect(context.visual?.[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(context.budget.visual).toMatchObject({ considered: 1, selected: 1, truncated: false })
  })

  it('drops a visual capture larger than its source budget', async () => {
    const { mission, step } = missionOf('/projects/alpha')
    const builder = createAssistantContextBuilder(
      dependencies({
        visual: async () => ({
          kind: 'document',
          mimeType: 'image/png',
          width: 4_000,
          height: 4_000,
          bytes: new Uint8Array(8_000_001),
          capturedAt: clock.now(),
        }),
      }),
    )

    const context = await builder.build({ mission, step, request: 'Inspect it', visual: true })

    expect(context.visual).toBeUndefined()
    expect(context.budget.visual).toMatchObject({ considered: 1, selected: 0, truncated: true })
  })
})

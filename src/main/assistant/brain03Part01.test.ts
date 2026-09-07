import { describe, expect, it, vi } from 'vitest'

import { ACTION_REGISTRY } from '@shared/domain/assistant'

import { CONTEXT_COMPOSED_MAX } from '@shared/domain/projectContext'

import type { Job } from '@shared/domain/job'

import { BRIEFING_ROOM, createProviderBrain, UTTERANCE_ROOM } from './brainProvider'

import { type ProviderLimits } from './providerLimits'

import { studioBriefing } from './instruction'

import { STATE_MAX } from './studioState'

/**
 * What `GET /models/model_scenario-llm` answers, `[M]` 2026-08-30 against the real account: the
 * `instruction` field takes 100 000 CHARACTERS, ten times what this file used to declare.
 */
export const SCHEMA: ProviderLimits = {
  instructionMax: 100_000,
  models: ['claude-haiku-4-5', 'gemini-3.5-flash-lite'],
  defaultModel: 'gemini-3.5-flash-lite',
  assumed: false,
}

export const reading =
  (limits: ProviderLimits = SCHEMA) =>
  () =>
    Promise.resolve(limits)

/** The briefing this door actually composes: the narrowest room the studio ships. */
export const shortBriefing = (context = ''): string =>
  studioBriefing({ context, room: BRIEFING_ROOM }).text

/** The instruction one turn of the Scenario door sends, sentence included. */
async function instructionSent(utterance: string, context = '', state = ''): Promise<string> {
  const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
  const brain = createProviderBrain({
    limits: reading(),
    run,
    readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
    model: () => 'claude-haiku-4-5',
  })
  await brain.think({ utterance, history: [], context, state })

  return String(run.mock.calls[0]?.[0]?.['instruction'])
}

export const succeeded = (assetIds: string[] = ['asset_reply'], cost = 0.75): Job => ({
  id: 'job_1',
  targetId: 'model_scenario-llm',
  label: 'Assistant',
  status: 'succeeded',
  progress: 1,
  createdAt: '2026-08-15T10:00:00.000Z',
  assetIds,
  cost,
})

describe('what the model is told', () => {
  /**
   * 🛑 The whole registry by NAME on the tightest door there is, where the same door used to be
   * shown eleven actions of 283 — and swore it could not do the other 272.
   */
  it('names every action of the registry, on the narrowest door', () => {
    const briefing = shortBriefing()

    for (const action of ACTION_REGISTRY) {
      expect(briefing.includes(action.name), action.name).toBe(true)
    }
  })

  /**
   * The other half, and the reason the names fit: what an action IS and what it takes costs
   * 90 994 characters for the registry, and is paid for only where a chain asked for it.
   *
   * The values a field closes over are the difference between a workspace that opens and one the
   * model invented — so a manual carries them, in English, from the bundle.
   */
  it('says what an action is for and what it takes, once it has been opened', () => {
    const opened = studioBriefing({ room: BRIEFING_ROOM, loaded: ['workspace.open'] }).text

    expect(shortBriefing()).not.toContain('Switches to a workspace')
    expect(opened).toContain('Switches to a workspace')
    expect(opened).toContain('one of: image, video, 3d, code, audio, materials, skyboxes')
  })

  /**
   * The budget is what stops a long paste from being answered with a 400. It falls on the
   * sentence, never on the instructions: trimming the end would take off the very thing being
   * answered and leave the catalogue whole.
   */
  it('cuts an over-long sentence rather than the instructions', async () => {
    const instruction = await instructionSent('x'.repeat(SCHEMA.instructionMax * 2))

    expect(instruction.length).toBe(SCHEMA.instructionMax)
    expect(instruction).toContain('Catalogue:')
    expect(instruction).toContain('workspace.open')
  })

  /**
   * Stated as what is LEFT rather than as what the preamble costs, because that is the property
   * that matters and the other one moved: 5 110 characters on 2026-08-15, **5 915 on 2026-08-25**,
   * most of it `command.runStudioCommand` enumerating a hundred command ids — which is what makes it usable.
   *
   * The floor was four thousand, then two, and is 1 500 — `UTTERANCE_ROOM` says which, so this
   * reads the constant rather than a number to be edited in three places. At 5 915 the four
   * thousand left EIGHTY-FIVE characters free, and a full project context costs 619 — so the
   * context could not have been added at all. The guarantee is unchanged whatever the figure: a
   * long paste is cut, the instructions always arrive whole.
   */
  it('leaves the person’s own sentence room to be long', async () => {
    expect(await instructionSent('x'.repeat(3_000))).toContain('x'.repeat(UTTERANCE_ROOM))
  })

  /** What the model is told about the project it is working in. */
  it('tells the model what the project is about', () => {
    expect(shortBriefing('World: A medieval forest')).toContain('World: A medieval forest')
  })

  /**
   * 🛑 The one that will rougir the day a verbose action joins the catalogue. The context is
   * bounded before it gets here — `composedContext` caps it — so the sentence never pays for it.
   *
   * Measured on the context ALONE: `notReady` lengthens the briefing too, and nothing here bounds
   * how many employments a machine can be short of at once.
   */
  it('leaves that room even under a project context of the full size', async () => {
    const sent = await instructionSent('y'.repeat(3_000), 'x'.repeat(CONTEXT_COMPOSED_MAX))

    expect(sent).toContain('y'.repeat(UTTERANCE_ROOM))
  })

  /**
   * 🛑 The WORST case, and the guard that has to move whenever a new block joins the preamble.
   * The state block was the newcomer: it is composed from titles and node names a person chose,
   * and the floor below is what the sentence keeps once the context AND the state are both full.
   */
  it('leaves that room with a full project context AND a full state block', async () => {
    const sent = await instructionSent(
      'y'.repeat(3_000),
      'x'.repeat(CONTEXT_COMPOSED_MAX),
      'z'.repeat(STATE_MAX),
    )

    expect(sent).toContain('y'.repeat(UTTERANCE_ROOM))
  })
})

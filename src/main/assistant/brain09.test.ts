import { describe, expect, it, vi } from 'vitest'

import type { Job } from '@shared/domain/job'

import { createProviderBrain } from './brainProvider'

import { type ProviderLimits } from './providerLimits'

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

/**
 * 🛑 Une porte ÉTROITE, et c'est la seule où le chargement à la demande vit encore : à
 * `instructionMax` = 10 000 la place laisse six manuels sur 283, donc le modèle doit demander.
 * Sur une porte large tout est décrit d'emblée et `actions.find` n'a rien à trouver.
 */
export const TIGHT: ProviderLimits = { ...SCHEMA, instructionMax: 10_000, assumed: true }

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

describe('thinking', () => {
  it('answers the reply and what it cost', async () => {
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve(succeeded()),
      readText: () => Promise.resolve('{"say":"Opening.","calls":[]}'),
      model: () => 'claude-haiku-4-5',
    })

    expect(await brain.think({ utterance: 'open a 3D file', history: [] })).toEqual({
      say: 'Opening.',
      calls: [],
      cost: 0.75,
    })
  })

  it('sends the history as text inputs, capped at what the API takes', async () => {
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve('{"say":"ok","calls":[]}'),
      model: () => 'claude-haiku-4-5',
    })

    const history = Array.from({ length: 25 }, (_, index) => `turn ${index}`)
    await brain.think({ utterance: 'and now?', history })

    const body = run.mock.calls[0]?.[0]
    if (!body) throw new Error('the request was not sent')
    expect(body.textInputs).toHaveLength(10)
    expect((body.textInputs as string[]).at(-1)).toBe('turn 24')
    expect(body.model).toBe('claude-haiku-4-5')
  })

  /**
   * One retry, and only one: a model that cannot answer the shape twice will not answer it the
   * third time, and every attempt is a creative unit off the person's balance. The answer is
   * quoted back because a model told only "that was not JSON" tends to send the same thing again.
   */
  it('asks once more, quoting the fault, and charges for both', async () => {
    const answers = ['I think you want a 3D file!', '{"say":"Opening.","calls":[]}']
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve(answers.shift() ?? ''),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({ utterance: 'open a 3D file', history: [] })

    expect(outcome).toEqual({ say: 'Opening.', calls: [], cost: 1.5 })
    const retry = run.mock.calls[1]?.[0]
    if (!retry) throw new Error('the retry request was not sent')
    expect((retry.textInputs as string[]).at(-1)).toContain('I think you want a 3D file!')
  })

  // Told only « not JSON », the model invented a second name and the mission died (31.1, 2026-09-06).
  it('names the unknown action in the retry, with the closest catalogue names', async () => {
    const answers = [
      '{"say":"","calls":[{"action":"scene.create","input":{"name":"Demo"}}]}',
      '{"say":"Opening.","calls":[]}',
    ]
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () => Promise.resolve(answers.shift() ?? ''),
      model: () => 'claude-haiku-4-5',
    })

    await brain.think({ utterance: 'create a scene', history: [] })

    const retry = run.mock.calls[1]?.[0]
    if (!retry) throw new Error('the retry request was not sent')
    const complaint = (retry.textInputs as string[]).at(-1) ?? ''
    expect(complaint).toContain('"scene.create", which is not an action of the catalogue')
    expect(complaint).toMatch(/the closest are [a-z]+\.[A-Za-z]+/)
  })

  /**
   * A word rather than a name: `actions.find` is still what a model reaches for when it cannot
   * name what it needs, and what its query finds is OPENED — fields and all — for the next round.
   */
  it('opens what a query found when the model asks what else there is', async () => {
    const answers = [
      '{"say":"","calls":[{"action":"actions.find","input":{"query":"git branch"}}]}',
      '{"say":"Switching.","calls":[{"action":"git.checkout","input":{"name":"main"}}]}',
    ]
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(TIGHT),
      run,
      readText: () => Promise.resolve(answers.shift() ?? ''),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({ utterance: 'switch to main', history: [] })

    expect(outcome.calls).toEqual([{ action: 'git.checkout', input: { name: 'main' } }])
    expect(outcome.cost).toBe(1.5)
    expect(String(run.mock.calls[1]?.[0]?.['instruction'])).toContain('  git.checkout —')
  })

  /**
   * 🛑 Defect 2: one name the briefing had not described used to refuse the WHOLE reply, and the
   * retry beside it complained about unreadable JSON — 25 refusals and as many turns lost. The
   * manual is opened instead, and the model writes its call again with the fields in front of it.
   */
  it('opens the manual of an action the answer named, rather than losing the answer', async () => {
    const answers = [
      '{"say":"","calls":[{"action":"git.checkout","input":{"branch":"main"}}]}',
      '{"say":"Switching.","calls":[{"action":"git.checkout","input":{"name":"main"}}]}',
    ]
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(TIGHT),
      run,
      readText: () => Promise.resolve(answers.shift() ?? ''),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({ utterance: 'switch to main', history: [] })

    expect(outcome.calls).toEqual([{ action: 'git.checkout', input: { name: 'main' } }])
    expect(outcome.loaded).toEqual(['git.checkout'])
    expect(String(run.mock.calls[0]?.[0]?.['instruction'])).not.toContain('  git.checkout —')
    expect(String(run.mock.calls[1]?.[0]?.['instruction'])).toContain('  git.checkout —')
  })

  /**
   * A plan that finds AND acts was written before the finding, so its other calls are the ones a
   * blind model made. Neither is run: both manuals are opened and the plan is written again.
   */
  it('does not treat a plan that also acts as a question', async () => {
    const answers = [
      '{"say":"","calls":[{"action":"actions.find","input":{"query":"git"}},' +
        '{"action":"files.list","input":{}}]}',
      '{"say":"Looking.","calls":[{"action":"files.list","input":{}}]}',
    ]
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(TIGHT),
      run,
      readText: () => Promise.resolve(answers.shift() ?? ''),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({ utterance: 'anything', history: [] })

    expect(outcome.calls).toEqual([{ action: 'files.list', input: {} }])
    // The manuals, never a query: a plan that acts is not a question, whatever it named first.
    const second = String(run.mock.calls[1]?.[0]?.['instruction'])
    expect(second).toContain('  files.list —')
    expect(second).not.toContain('The manual above now holds')
  })

  /**
   * 🛑 What a chain hands back to the window, and what the window hands back on the next round:
   * without it every round reopens the same manuals, at a billed round trip each.
   */
  it('starts a round with the manuals the window says are already open', async () => {
    const run = vi.fn((_body: Record<string, unknown>) => Promise.resolve(succeeded()))
    const brain = createProviderBrain({
      limits: reading(),
      run,
      readText: () =>
        Promise.resolve('{"say":"Switching.","calls":[{"action":"git.checkout","input":{}}]}'),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({
      utterance: 'switch to main',
      history: [],
      loaded: ['git.checkout'],
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(outcome.loaded).toEqual(['git.checkout'])
    expect(String(run.mock.calls[0]?.[0]?.['instruction'])).toContain('  git.checkout —')
  })

  it('gives up after the second, saying nothing rather than throwing', async () => {
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve(succeeded()),
      readText: () => Promise.resolve('still not JSON'),
      model: () => 'claude-haiku-4-5',
    })

    const outcome = await brain.think({ utterance: 'open a 3D file', history: [] })

    expect(outcome).toEqual({ say: '', calls: [], unreadable: true, cost: 1.5 })
  })

  // A job that failed was still paid for, and the total the modal shows has to say so.
  it('counts what a failed job cost', async () => {
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve({ ...succeeded([], 0.75), status: 'failed', error: 'rejected' }),
      readText: () => Promise.resolve(''),
      model: () => 'claude-haiku-4-5',
    })

    expect((await brain.think({ utterance: 'hello', history: [] })).cost).toBe(1.5)
  })

  it('reads no asset when the job produced none', async () => {
    const readText = vi.fn(() => Promise.resolve(''))
    const brain = createProviderBrain({
      limits: reading(),
      run: () => Promise.resolve(succeeded([])),
      readText,
      model: () => 'claude-haiku-4-5',
    })

    await brain.think({ utterance: 'hello', history: [] })

    expect(readText).not.toHaveBeenCalled()
  })
})

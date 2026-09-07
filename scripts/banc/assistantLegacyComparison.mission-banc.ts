import { afterAll, describe, expect, it } from 'vitest'
import { CLOUD_PROVIDERS, defaultChatModel } from '@shared/domain/aiCloud'
import { isRecord } from '@shared/guards'
import { createHttpChatBrain } from '@main/assistant/brainHttp'
import { play } from './play'
import { SCENARIOS } from './scenarios'

const KEY = process.env['EVAL_KEY'] ?? ''
const RUNS = Math.max(1, Math.trunc(Number(process.env['EVAL_RUNS'] ?? 3)) || 1)
const PROVIDER = process.env['EVAL_PROVIDER'] ?? 'deepseek'
const cloud = CLOUD_PROVIDERS.find(provider => provider.id === PROVIDER)
const chat = cloud?.chat !== undefined && cloud.chat.kind !== 'scenario' ? cloud.chat : null
const MODEL = process.env['EVAL_MODEL'] ?? defaultChatModel(PROVIDER) ?? ''
const NAMES = new Set([
  '1.1 names the open project and the open documents',
  '6.1 adds a cube at the centre',
  '6.2 renames the cube Cube Test',
  '12.2 turns its first material red',
  '20.1 generates a photoreal red car in a Paris street',
  '22.1 generates a 3D model of a wooden chest',
  '41.6 makes a project called Démo Assistant',
  '57.4 remembers the project aims at photoreal marine work',
  '58.7 puts the project under version control',
])

type Result = { name: string; passed: number; actions: number; rounds: number; tokens: number }
const results: Result[] = []

function counting(result: Result): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init)
    const written = await response.text()
    const body = parsed(written)
    const usage = isRecord(body) && isRecord(body['usage']) ? body['usage'] : {}
    result.tokens +=
      (typeof usage['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : 0) +
      (typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0)
    return new Response([204, 205, 304].includes(response.status) ? null : written, response)
  }
}

function parsed(written: string): unknown {
  try {
    return JSON.parse(written)
  } catch {
    return null
  }
}

describe.skipIf(KEY === '' || chat === null)(`legacy comparison with ${PROVIDER}`, () => {
  it.each(SCENARIOS.filter(scenario => NAMES.has(scenario.name)))(
    '$name',
    { timeout: 1_800_000 },
    async scenario => {
      const result: Result = { name: scenario.name, passed: 0, actions: 0, rounds: 0, tokens: 0 }
      const failures: string[] = []
      const brain = createHttpChatBrain({
        cloud: PROVIDER,
        chat: chat ?? { kind: 'openai', baseUrl: '', model: '' },
        credentials: () => ({ key: KEY, secret: '' }),
        model: () => MODEL,
        fetch: counting(result),
      })
      for (let run = 0; run < RUNS; run += 1) {
        const played = await play(scenario, request => brain.think(request))
        try {
          result.actions += played.called.length
          result.rounds += played.rounds
          if (scenario.passed(played)) result.passed += 1
          else failures.push(played.called.map(call => call.action).join(', ') || 'no action')
        } finally {
          played.studio.close()
        }
      }
      results.push(result)
      expect(result.passed, failures.join('\n')).toBe(RUNS)
    },
  )

  afterAll(() => {
    const sum = (read: (result: Result) => number): number =>
      results.reduce((total, result) => total + read(result), 0)
    const passed = sum(result => result.passed)
    console.log(
      `\n  legacy comparison — ${PROVIDER}/${MODEL}: ` +
        `${Math.round((passed / (results.length * RUNS)) * 100)}% passed · ` +
        `${sum(result => result.tokens)} tokens · ${sum(result => result.actions)} actions · ` +
        `${sum(result => result.rounds)} rounds`,
    )
    for (const result of results)
      console.log(`  ${result.name}: ${result.passed}/${RUNS}, ${result.actions} actions`)
  })
})

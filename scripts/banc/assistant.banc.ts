import { afterAll, describe, expect, it } from 'vitest'
import { CLOUD_PROVIDERS, defaultChatModel } from '@shared/domain/aiCloud'
import { isRecord } from '@shared/guards'
import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'
import { createHttpChatBrain } from '@main/assistant/brainHttp'
import { SCENARIOS } from './scenarios'
import { coveredActions } from './coverage'
import type { Run } from './run'
import { play, shortly } from './play'

/**
 * A REAL model, over the real request path, against the REAL studio — the one thing a suite
 * cannot measure. Out of `pnpm validate` on purpose: it costs money and answers differently
 * twice in a row.
 */
const KEY = process.env['EVAL_KEY'] ?? ''

/**
 * 🛑 How many times each scenario is played, because ONE play measures nothing: the same code
 * scored 60% and then 40% two minutes apart, on the same five scenarios. A model is not a
 * function, and a bench that reads it as one reports noise as progress.
 */
const RUNS = Math.max(1, Math.trunc(Number(process.env['EVAL_RUNS'] ?? 3)) || 1)
const PROVIDER = process.env['EVAL_PROVIDER'] ?? 'deepseek'

/**
 * 🛑 A door this bench can speak to, which Scenario is not: its chat crosses an account and a
 * secret rather than a bare HTTP key, and `ask` has no arm for it. A cloud with NO door at all is
 * the other one — it generates and answers no conversation. Named rather than left to fail on a
 * 400 nobody can read.
 */
const cloud = CLOUD_PROVIDERS.find(one => one.id === PROVIDER)
const chat = cloud?.chat !== undefined && cloud.chat.kind !== 'scenario' ? cloud.chat : null
const MODEL = process.env['EVAL_MODEL'] ?? defaultChatModel(PROVIDER) ?? ''

type Measured = {
  name: string
  passed: number
  of: number
  rounds: number
  refused: number
} & Tokens

/**
 * What a turn actually costs, which `cost` cannot say: that field counts Scenario's creative
 * units, and every other cloud bills tokens. Read off the answer's own `usage`, so it is the
 * figure the invoice is made of rather than one this file computed.
 */
type Tokens = { sent: number; back: number; cached: number }

const NOTHING: Tokens = { sent: 0, back: 0, cached: 0 }

const NO_BODY: readonly number[] = [204, 205, 304]

/** The statuses that refuse the KEY rather than the request — and with it the whole run. */
const DOOR_SHUT: readonly number[] = [401, 403]

// 🛑 The first refusal fails every scenario after it: a dead key played 439 scenarios to 0 %
// with `auth` written nowhere, `0 sent` its only trace — measured 2026-09-01.
let shut: string | null = null

/** Counts what crossed, and hands the response on untouched. */
function counting(into: Tokens): (input: string, init?: RequestInit) => Promise<Response> {
  return async (input, init) => {
    const answer = await fetch(input, init)
    if (DOOR_SHUT.includes(answer.status)) shut = `the door refused the key: HTTP ${answer.status}`
    // Read ONCE and handed on as text: `clone().json()` buffers the whole body a second time,
    // and the brain parses it again straight after — on every round of every scenario.
    const written = await answer.text()
    // A proxy answering HTML on a 401 or a 502 is not a fault of this counter's making, and a
    // parse error here would abort the run before the code below could report the real one.
    const body: unknown = parsed(written)
    const usage = isRecord(body) && isRecord(body['usage']) ? body['usage'] : {}
    // Three spellings for one figure: OpenAI and its compatibles, Anthropic, and Gemini. Read
    // from one of them only, every count stays 0 and the report divides by it.
    const nested = isRecord(body) && isRecord(body['usageMetadata']) ? body['usageMetadata'] : {}
    const from = (of: Record<string, unknown>, key: string): number =>
      typeof of[key] === 'number' ? of[key] : 0

    into.sent +=
      from(usage, 'prompt_tokens') + from(usage, 'input_tokens') + from(nested, 'promptTokenCount')
    into.back +=
      from(usage, 'completion_tokens') +
      from(usage, 'output_tokens') +
      from(nested, 'candidatesTokenCount')
    // What the door served from its own cache — the figure the next lot is about.
    into.cached += from(usage, 'prompt_cache_hit_tokens') + from(usage, 'cache_read_input_tokens')
    // 204, 205 and 304 carry no body, and the constructor refuses one on those.
    return new Response(NO_BODY.includes(answer.status) ? null : written, answer)
  }
}

/** What the door answered, or nothing at all — an HTML error page is not a fault of the counter. */
function parsed(written: string): unknown {
  try {
    return JSON.parse(written)
  } catch {
    return null
  }
}

const measured: Measured[] = []

/** Every action any run actually chose — the MEASURED half of what `coverage.ts` declares. */
const touched = new Set<ActionName>()

const sumOf = (read: (one: Measured) => number): number =>
  measured.reduce((total, one) => total + read(one), 0)

const inputShown = (input: Record<string, unknown>): string =>
  Object.entries(input)
    .map(([key, value]) => `${key}=${shortly(value)}`)
    .join(' ')

/**
 * 🛑 One failed run, as something a reader can act on WITHOUT paying for another: names alone
 * read the same whether the model searched with the wrong words or believed it was done.
 */
function transcriptOf(played: Run): string {
  if (played.called.length === 0) return `no call — said: ${shortly(played.said)}`

  const steps = played.called.map((one, at) => {
    const said = inputShown(one.input)
    return `      ${at + 1}. ${one.action}${said ? ` ${said}` : ''} → ${one.answer === undefined ? 'never ran' : shortly(one.answer)}`
  })

  return [`${played.called.length} calls`, ...steps, `      said: ${shortly(played.said)}`].join(
    '\n',
  )
}

describe.skipIf(KEY === '' || chat === null)(`what ${PROVIDER} does with a real request`, () => {
  it.each(SCENARIOS)('$name', { timeout: 1_800_000 }, async scenario => {
    const tally: Measured = {
      name: scenario.name,
      passed: 0,
      of: RUNS,
      rounds: 0,
      refused: 0,
      ...NOTHING,
    }
    const missed: string[] = []
    if (shut !== null) throw new Error(shut)

    const brain = createHttpChatBrain({
      cloud: PROVIDER,
      chat: chat ?? { kind: 'openai', baseUrl: '', model: '' },
      credentials: () => ({ key: KEY, secret: '' }),
      model: () => MODEL,
      fetch: counting(tally),
    })

    for (let run = 0; run < RUNS; run += 1) {
      const played = await play(scenario, request => brain.think(request))
      // 🛑 In a `finally`: the surfaces this run stood in for include a store SUBSCRIPTION, which
      // piles up rather than being replaced — a run that throws would leave every later scenario
      // paying it, once per streamed token.
      try {
        if (shut !== null) throw new Error(shut)
        tally.rounds += played.rounds
        tally.refused += played.refused

        // What it CHOSE is the whole finding: a bare `false` sends the reader back to spend the
        // same money again to learn what this line already holds. Names alone are not enough —
        // "searched, then stopped" and "searched with the wrong words" read identically.
        if (scenario.passed(played)) tally.passed += 1
        else missed.push(transcriptOf(played))

        for (const one of played.called) touched.add(one.action)
      } finally {
        played.studio.close()
      }
    }

    measured.push(tally)
    expect(tally.passed, missed.join('\n  ')).toBe(RUNS)
  })

  afterAll(() => {
    if (measured.length === 0) return

    const rate = sumOf(one => one.passed) / sumOf(one => one.of)

    console.log(`\n  ${PROVIDER} — ${MODEL}, ${RUNS} runs each`)
    for (const one of measured) {
      console.log(
        `  ${one.passed === one.of ? '✓' : '✗'} ${one.name} — ${one.passed}/${one.of} passed, ` +
          `${(one.rounds / one.of).toFixed(1)} rounds, ` +
          `${one.refused} refused, ${one.sent} sent (${one.cached} cached), ${one.back} back`,
      )
    }
    const sent = sumOf(one => one.sent)

    // 🛑 What `coverage.ts` PROMISED against what this run actually chose. A declared action no
    // run ever reached is a tool still unseen, and the table says otherwise until this prints.
    const promised = coveredActions().filter(one => !touched.has(one))
    console.log(
      `\n  MCP reached: ${touched.size}/${ACTION_REGISTRY.length} actions` +
        (promised.length > 0
          ? `\n  🛑 declared covered, never reached: ${promised.join(', ')}`
          : ''),
    )

    console.log(
      `\n  passed ${Math.round(rate * 100)}% · ${sumOf(one => one.rounds)} rounds · ` +
        `${sumOf(one => one.refused)} refused · ${Math.round(sent / sumOf(one => one.rounds))} ` +
        `tokens a round, ${Math.round((sumOf(one => one.cached) / sent) * 100)}% of them cached\n`,
    )
  })
})

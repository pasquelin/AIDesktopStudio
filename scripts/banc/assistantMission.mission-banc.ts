import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLOUD_PROVIDERS, defaultChatModel } from '@shared/domain/aiCloud'
import { isRecord } from '@shared/guards'
import { createHttpChatBrain } from '@main/assistant/brainHttp'
import { createActionIndex } from '@main/actionIndex/actionIndex'
import { actionCorpus } from '@main/actionIndex/actionCorpus'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { createMissionMetrics, type MissionRuntimeMetrics } from '@main/mission/metrics'
import type { Run, Scenario } from './run'
import { SCENARIOS } from './scenarios'
import { playMission, type MissionRun } from './playMission'
import { callKey } from '@main/mission/runtimeGuards'
import { missionFailureClassOf, type MissionFailureClass } from './missionFailures'
import {
  expectedMissionActions,
  missionFamilyCoverage,
  missionScenarios,
  scenarioFamilies,
  type MissionBenchSet,
} from './missionCatalogue'

const KEY = process.env['EVAL_KEY'] ?? ''
const RUNS = Math.max(1, Math.trunc(Number(process.env['EVAL_RUNS'] ?? 3)) || 1)
const PROVIDER = process.env['EVAL_PROVIDER'] ?? 'deepseek'
const cloud = CLOUD_PROVIDERS.find(provider => provider.id === PROVIDER)
const chat = cloud?.chat !== undefined && cloud.chat.kind !== 'scenario' ? cloud.chat : null
const MODEL = process.env['EVAL_MODEL'] ?? defaultChatModel(PROVIDER) ?? ''
const TRACE_FOLDER =
  process.env['MISSION_TRACE_DIR'] ??
  `logs/mission-runtime/${new Date().toISOString().replace(/[:.]/g, '-')}`

const requestedSet = process.env['MISSION_BENCH_SET'] ?? 'baseline'
function missionBenchSet(value: string): MissionBenchSet {
  if (value === 'representative' || value === 'expanded' || value === 'all') return value
  return 'baseline'
}
const BENCH_SET = missionBenchSet(requestedSet)
const scenarios = missionScenarios(SCENARIOS, BENCH_SET, process.env['MISSION_BENCH_RANKS'] ?? '')

/** `native` counts the answers that came back as tool calls rather than as JSON text. */
type Tokens = { sent: number; back: number; cached: number; calls: number; native: number }
type Result = {
  name: string
  passed: number
  actions: number
  unnecessary: number
  searches: number
  milliseconds: number
  tokens: Tokens
  metrics: MissionRuntimeMetrics
  families: readonly string[]
  /** One class per failed run — what to fix first, read off the run rather than the words. */
  failures: MissionFailureClass[]
}

const failureClassOf = (scenario: Scenario, played: MissionRun): MissionFailureClass =>
  missionFailureClassOf({
    expected: expectedMissionActions(scenario),
    candidates: played.candidates,
    called: played.called,
    missionStates: played.missions.map(mission => mission.state),
  })

const emptyMetrics = (): MissionRuntimeMetrics => createMissionMetrics().read()

function addMetrics(total: MissionRuntimeMetrics, metrics: MissionRuntimeMetrics): void {
  total.contextChars += metrics.contextChars
  total.contextSources += metrics.contextSources
  total.actionCandidates += metrics.actionCandidates
  total.actionsSentToLlm += metrics.actionsSentToLlm
  total.memoryCandidates += metrics.memoryCandidates
  total.memoriesSentToLlm += metrics.memoriesSentToLlm
  total.visualContextBytes += metrics.visualContextBytes
  total.missionSteps += metrics.missionSteps
  total.llmCalls += metrics.llmCalls
  total.planningCalls += metrics.planningCalls
  total.replans += metrics.replans
  total.revisionConflicts += metrics.revisionConflicts
  total.userWaits += metrics.userWaits
  total.jobWaits += metrics.jobWaits
  total.maximumConcurrentMissions = Math.max(
    total.maximumConcurrentMissions,
    metrics.maximumConcurrentMissions,
  )
  total.actionIndexSearches += metrics.actionIndexSearches
}

function counting(tokens: Tokens): typeof fetch {
  return async (input, init) => {
    tokens.calls += 1
    const response = await fetch(input, init)
    const written = await response.text()
    const body = parsed(written)
    const usage = isRecord(body) && isRecord(body['usage']) ? body['usage'] : {}
    const number = (key: string): number => (typeof usage[key] === 'number' ? usage[key] : 0)
    tokens.sent += number('prompt_tokens') + number('input_tokens')
    tokens.back += number('completion_tokens') + number('output_tokens')
    tokens.cached += number('prompt_cache_hit_tokens') + number('cache_read_input_tokens')
    if (answeredWithTools(body)) tokens.native += 1
    return new Response([204, 205, 304].includes(response.status) ? null : written, response)
  }
}

function answeredWithTools(body: unknown): boolean {
  const first = isRecord(body) && Array.isArray(body['choices']) ? body['choices'][0] : null
  const message = isRecord(first) ? first['message'] : null
  return isRecord(message) && Array.isArray(message['tool_calls'])
}

function parsed(written: string): unknown {
  try {
    return JSON.parse(written)
  } catch {
    return null
  }
}

function resultPassed(scenario: Scenario, run: Run): boolean {
  if (scenario.name === '57.4 remembers the project aims at photoreal marine work') {
    return run.studio
      .memories()
      .some(memory =>
        `${memory.summary} ${memory.body}`.toLocaleLowerCase('fr').includes('photoréaliste marine'),
      )
  }
  if (scenario.name !== '1.1 names the open project and the open documents') {
    return scenario.passed(run)
  }
  const answer = run.said.toLocaleLowerCase('fr')
  return (
    answer.includes(run.studio.projectName().toLocaleLowerCase('fr')) &&
    run.studio
      .documents()
      .every(document => answer.includes(document.title.toLocaleLowerCase('fr')))
  )
}

function unnecessaryActions(_scenario: Scenario, run: Run): number {
  const seen = new Set<string>()
  return run.called.filter(call => {
    const key = callKey(call)
    const unnecessary = call.answer?.startsWith('refused') === true || seen.has(key)
    seen.add(key)
    return unnecessary
  }).length
}

const actionDatabase = openMemoryDatabase()
const actionIndex = createActionIndex(actionDatabase)
actionIndex.rebuild(actionCorpus())
const results: Result[] = []

describe.skipIf(KEY === '' || chat === null)(`mission runtime with ${PROVIDER}`, () => {
  it.each(scenarios)('$name', { timeout: 1_800_000 }, async scenario => {
    const result: Result = {
      name: scenario.name,
      passed: 0,
      actions: 0,
      unnecessary: 0,
      searches: 0,
      milliseconds: 0,
      tokens: { sent: 0, back: 0, cached: 0, calls: 0, native: 0 },
      metrics: emptyMetrics(),
      families: scenarioFamilies(scenario),
      failures: [],
    }
    const failures: string[] = []
    const brain = createHttpChatBrain({
      cloud: PROVIDER,
      chat: chat ?? { kind: 'openai', baseUrl: '', model: '' },
      credentials: () => ({ key: KEY, secret: '' }),
      model: () => MODEL,
      fetch: counting(result.tokens),
    })

    for (let run = 0; run < RUNS; run += 1) {
      const started = performance.now()
      const played = await playMission(
        scenario,
        async (request, watch) => await brain.think(request, watch),
        {
          search: async (query, limit, available, scope) =>
            actionIndex.search({ query, limit, available, scope }),
        },
        { folder: TRACE_FOLDER, scenarioId: scenario.name, runId: run + 1 },
      )
      try {
        result.milliseconds += performance.now() - started
        result.actions += played.called.length
        result.searches += played.called.filter(call => call.action === 'actions.find').length
        result.unnecessary += unnecessaryActions(scenario, played)
        addMetrics(result.metrics, played.metrics)
        if (resultPassed(scenario, played)) result.passed += 1
        else {
          const failure = failureClassOf(scenario, played)
          result.failures.push(failure)
          failures.push(
            `[${failure}] ${played.called.map(call => call.action).join(', ') || 'no action'} — ${played.said}`,
          )
        }
      } finally {
        played.studio.close()
      }
    }
    results.push(result)
    expect(result.passed, failures.join('\n')).toBe(RUNS)
  })

  afterAll(() => {
    const passed = results.reduce((total, result) => total + result.passed, 0)
    const total = results.length * RUNS
    const sum = (read: (result: Result) => number): number =>
      results.reduce((value, result) => value + read(result), 0)
    console.log(`\n  mission runtime — ${PROVIDER}/${MODEL}, ${RUNS} runs`)
    for (const result of results) {
      console.log(
        `  ${result.passed === RUNS ? '✓' : '✗'} ${result.name}: ${result.passed}/${RUNS}, ` +
          `${result.actions} actions, ${result.unnecessary} unnecessary, ` +
          `${result.metrics.actionsSentToLlm} candidates sent, ${result.tokens.sent} tokens` +
          (result.failures.length > 0 ? ` — ${result.failures.join(', ')}` : ''),
      )
    }
    const byClass = new Map<MissionFailureClass, number>()
    for (const one of results.flatMap(result => result.failures))
      byClass.set(one, (byClass.get(one) ?? 0) + 1)
    if (byClass.size > 0)
      console.log(
        `  failures by class: ${[...byClass].map(([name, count]) => `${name} ${count}`).join(' · ')}`,
      )
    console.log(
      `  ${Math.round((passed / total) * 100)}% passed · ${sum(result => result.tokens.sent)} tokens · ` +
        `${sum(result => result.metrics.contextChars)} context chars · ` +
        `${sum(result => result.metrics.llmCalls)} runtime rounds · ` +
        `${sum(result => result.tokens.calls)} provider calls · ` +
        `${sum(result => result.tokens.native)} native tool answers · ` +
        `${sum(result => result.metrics.replans)} replans · ` +
        `${sum(result => result.metrics.revisionConflicts)} revision conflicts · ` +
        `${sum(result => result.metrics.userWaits)} user waits · ` +
        `${sum(result => result.metrics.jobWaits)} job waits · ` +
        `${Math.max(...results.map(result => result.metrics.maximumConcurrentMissions))} concurrent missions max · ` +
        `${sum(result => result.metrics.actionIndexSearches)} index searches · ` +
        `${sum(result => result.searches)} model action searches · ${Math.round(sum(result => result.milliseconds))} ms`,
    )
    console.log(`  causal traces: ${TRACE_FOLDER}`)
    mkdirSync(TRACE_FOLDER, { recursive: true })
    writeFileSync(
      join(TRACE_FOLDER, 'summary.json'),
      `${JSON.stringify(
        {
          benchSet: BENCH_SET,
          provider: PROVIDER,
          model: MODEL,
          runs: RUNS,
          scenarios: scenarios.length,
          passed,
          total,
          tokens: sum(result => result.tokens.sent),
          contextChars: sum(result => result.metrics.contextChars),
          candidates: sum(result => result.metrics.actionsSentToLlm),
          actions: sum(result => result.actions),
          unnecessary: sum(result => result.unnecessary),
          rounds: sum(result => result.metrics.llmCalls),
          providerCalls: sum(result => result.tokens.calls),
          nativeAnswers: sum(result => result.tokens.native),
          topK: 12,
          failuresByClass: Object.fromEntries(byClass),
          coverage: missionFamilyCoverage(scenarios),
          results,
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
  })
})

afterAll(() => actionIndex.close())

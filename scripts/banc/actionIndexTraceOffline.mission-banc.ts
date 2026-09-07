import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createActionIndex, type ActionSearchScope } from '@main/actionIndex/actionIndex'
import type { AsyncActionIndex } from '@main/actionIndex/actionIndexClient'
import { actionCorpus } from '@main/actionIndex/actionCorpus'
import { createActionSearchService } from '@main/actionIndex/actionSearchService'
import { namedActionTarget } from '@main/actionIndex/actionSearchContext'
import type { Embedder } from '@main/memory/embedder'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { isRecord } from '@shared/guards'
import {
  ACTION_RESOURCES,
  type ActionName,
  type ActionResource,
  type ActionTarget,
} from '@shared/domain/assistant'
import { DOCUMENT_KINDS } from '@shared/domain/document'
import { expectedMissionActions } from './missionCatalogue'
import { SCENARIOS } from './scenarios'

const TRACE_FOLDER = process.env['ACTION_RETRIEVAL_TRACE_DIR'] ?? ''
const OUTPUT = process.env['ACTION_RETRIEVAL_DIR'] ?? 'logs/mission-runtime/trace-retrieval'

const noEmbedding: Embedder = {
  chosen: () => null,
  embed: async () => [],
  embedQuery: async () => new Float32Array(),
  close: async () => undefined,
}

type Retrieval = {
  query: string
  available: readonly ActionResource[]
  scope: ActionSearchScope
  candidates: readonly string[]
}

type Trace = {
  scenarioId: string
  userRequest: string
  retrievals: readonly Retrieval[]
}

type TraceSummary = {
  failed: ReadonlySet<string>
}

type Evaluation = {
  scenario: string
  family: string
  request: string
  expected: ActionName
  bestRank: number
  included: boolean
  query: string
  scope: ActionSearchScope
  available: readonly ActionResource[]
  falsePositives: readonly ActionName[]
  ranking: Awaited<ReturnType<ReturnType<typeof createActionSearchService>['inspect']>>
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

const ACTION_TARGETS: readonly ActionTarget[] = [
  'asset',
  'bone',
  'camera',
  'chat',
  'clip',
  'component',
  'document',
  'favorite',
  'file',
  'generation',
  'git',
  'job',
  'layer',
  'media',
  'memory',
  'node',
  'project',
  'projectContext',
  'rig',
  'studio',
  'timeline',
  'track',
  'world',
]

function targets(value: unknown): readonly ActionTarget[] {
  const known = new Set<string>(ACTION_TARGETS)
  return strings(value).filter((item): item is ActionTarget => known.has(item))
}

function resources(value: unknown): readonly ActionResource[] {
  const known = new Set<string>(Object.keys(ACTION_RESOURCES))
  return strings(value).filter((item): item is ActionResource => known.has(item))
}

function scopeOf(value: unknown): ActionSearchScope {
  if (!isRecord(value)) return {}
  return {
    ...(typeof value['target'] === 'string' ? { target: value['target'] } : {}),
    ...(Array.isArray(value['availableTargets'])
      ? { availableTargets: targets(value['availableTargets']) }
      : {}),
    ...(typeof value['document'] === 'string' ? { document: value['document'] } : {}),
    ...(value['documentAuthority'] === 'active' || value['documentAuthority'] === 'explicit'
      ? { documentAuthority: value['documentAuthority'] }
      : {}),
  }
}

function retrievalOf(value: unknown): Retrieval | null {
  if (!isRecord(value) || typeof value['query'] !== 'string') return null
  const candidates = Array.isArray(value['candidates'])
    ? value['candidates'].flatMap(candidate =>
        isRecord(candidate) &&
        isRecord(candidate['action']) &&
        typeof candidate['action']['name'] === 'string'
          ? [candidate['action']['name']]
          : [],
      )
    : []
  const scope = scopeOf(value['scope'])
  const document = DOCUMENT_KINDS.find(kind => kind === scope.document)
  const namedTarget = namedActionTarget(value['query'], document)
  return {
    query: value['query'],
    available: resources(value['available']),
    scope: namedTarget === null ? scope : { ...scope, target: namedTarget },
    candidates,
  }
}

function traceOf(path: string): Trace | null {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(parsed) || typeof parsed['scenarioId'] !== 'string') return null
  const reflections = Array.isArray(parsed['reflections']) ? parsed['reflections'] : []
  return {
    scenarioId: parsed['scenarioId'],
    userRequest: typeof parsed['userRequest'] === 'string' ? parsed['userRequest'] : '',
    retrievals: reflections.flatMap(reflection => {
      if (!isRecord(reflection)) return []
      const retrieval = retrievalOf(reflection['actionIndex'])
      return retrieval ? [retrieval] : []
    }),
  }
}

function traceSummary(): TraceSummary {
  const parsed: unknown = JSON.parse(readFileSync(join(TRACE_FOLDER, 'summary.json'), 'utf8'))
  if (!isRecord(parsed) || !Array.isArray(parsed['results'])) return { failed: new Set() }
  return {
    failed: new Set(
      parsed['results'].flatMap(result =>
        isRecord(result) && typeof result['name'] === 'string' && result['passed'] === 0
          ? [result['name']]
          : [],
      ),
    ),
  }
}

function asyncIndex(index: ReturnType<typeof createActionIndex>): AsyncActionIndex {
  return {
    rebuild: async corpus => index.rebuild(corpus),
    writeEmbeddings: async embeddings => index.writeEmbeddings(embeddings),
    search: async search => index.search(search),
    inspect: async search => index.inspect(search),
    fingerprint: async () => index.fingerprint(),
    embeddingModel: async () => index.embeddingModel(),
    count: async () => index.count(),
    close: async () => index.close(),
  }
}

const database = openMemoryDatabase()
const index = createActionIndex(database)
index.rebuild(actionCorpus())
const service = createActionSearchService({
  userData: OUTPUT,
  embedder: noEmbedding,
  open: async () => asyncIndex(index),
  onTrouble: message => {
    throw new Error(message)
  },
})

const traces =
  TRACE_FOLDER === ''
    ? []
    : readdirSync(TRACE_FOLDER)
        .filter(file => file.endsWith('.json') && file !== 'summary.json')
        .flatMap(file => {
          const trace = traceOf(join(TRACE_FOLDER, file))
          return trace ? [trace] : []
        })
const summary = TRACE_FOLDER === '' ? { failed: new Set<string>() } : traceSummary()
const scenarios = new Map(SCENARIOS.map(scenario => [scenario.name, scenario]))
const evaluations: Evaluation[] = []

describe.skipIf(TRACE_FOLDER === '')('ActionIndex trace retrieval', () => {
  for (const trace of traces) {
    if (!summary.failed.has(trace.scenarioId)) continue
    const scenario = scenarios.get(trace.scenarioId)
    if (!scenario) continue
    const expected = expectedMissionActions(scenario)
    if (expected.length === 0) continue
    const sent = new Set(trace.retrievals.flatMap(retrieval => retrieval.candidates))
    if (expected.some(action => sent.has(action))) continue

    for (const action of expected)
      it(`${trace.scenarioId}: ${action}`, async () => {
        const rankings = await Promise.all(
          trace.retrievals.map(async retrieval => ({
            retrieval,
            ranking: await service.inspect(
              retrieval.query,
              12,
              retrieval.available,
              retrieval.scope,
            ),
          })),
        )
        const matches = rankings.flatMap(({ retrieval, ranking }) => {
          const match = ranking.find(candidate => candidate.action.name === action)
          return match ? [{ retrieval, ranking, match }] : []
        })
        const best = matches.sort((left, right) => left.match.rank - right.match.rank)[0]
        expect(best).toBeDefined()
        if (!best) return
        evaluations.push({
          scenario: trace.scenarioId,
          family: best.match.action.family,
          request: trace.userRequest,
          expected: action,
          bestRank: best.match.rank,
          included: best.match.included,
          query: best.retrieval.query,
          scope: best.retrieval.scope,
          available: best.retrieval.available,
          falsePositives: best.ranking
            .filter(candidate => candidate.rank < best.match.rank)
            .map(candidate => candidate.action.name),
          ranking: best.ranking,
        })
      })
  }

  afterAll(async () => {
    const recall = (limit: number): number =>
      evaluations.filter(evaluation => evaluation.bestRank <= limit).length / evaluations.length
    const report = {
      traceFolder: basename(TRACE_FOLDER),
      evaluations: evaluations.length,
      metrics: {
        recallAt1: recall(1),
        recallAt3: recall(3),
        recallAt5: recall(5),
        recallAt12: recall(12),
        mrr:
          evaluations.reduce((total, evaluation) => total + 1 / evaluation.bestRank, 0) /
          evaluations.length,
        meanRank:
          evaluations.reduce((total, evaluation) => total + evaluation.bestRank, 0) /
          evaluations.length,
      },
      cases: evaluations,
    }
    mkdirSync(OUTPUT, { recursive: true })
    writeFileSync(join(OUTPUT, 'trace-retrieval.json'), `${JSON.stringify(report, null, 2)}\n`)
    await service.close()
  })
})

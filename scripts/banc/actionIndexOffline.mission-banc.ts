import { afterAll, describe, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createActionIndex,
  type ActionIndex,
  type ActionSearchScope,
} from '@main/actionIndex/actionIndex'
import type { AsyncActionIndex } from '@main/actionIndex/actionIndexClient'
import { actionCorpus } from '@main/actionIndex/actionCorpus'
import { createActionSearchService } from '@main/actionIndex/actionSearchService'
import { actionSearchScope, availableActionTargets } from '@main/actionIndex/actionSearchContext'
import type { Embedder } from '@main/memory/embedder'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { ACTION_FAMILIES, type ActionName } from '@shared/domain/assistant'
import { expectedMissionActions } from './missionCatalogue'
import { SCENARIOS } from './scenarios'
import { PROJECT } from './project'
import { createStudio } from './studio'

const OUTPUT = process.env['ACTION_RETRIEVAL_DIR'] ?? 'logs/mission-runtime/phase-10-5-offline'

function asyncIndex(index: ActionIndex): AsyncActionIndex {
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

const noEmbedding: Embedder = {
  chosen: () => null,
  embed: async () => [],
  embedQuery: async () => new Float32Array(),
  close: async () => undefined,
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

type Evaluation = {
  scenario: string
  request: string
  expected: ActionName
  family: string
  rank: number
  included: boolean
  score: number
  milliseconds: number
  falsePositives: readonly ActionName[]
  ranking: readonly RankedSignals[]
}

type RankedSignals = {
  action: ActionName
  lexicalScore: number
  bm25Score: number
  semanticScore: number | null
  scopeScore: number
  workflowScore: number
  resourceScore: number
  compatibilityScore: number
  intentScore: number
  fusionScore: number
  relevanceScore: number
  applicabilityScore: number
  documentAffinity: string
  score: number
  rank: number
  included: boolean
  exclusion: string | null
}

const evaluations: Evaluation[] = []
const generalization: Evaluation[] = []

const GENERALIZATION_CASES: readonly { request: string; expected: ActionName }[] = [
  { request: 'make the selected object disappear from view', expected: 'node.setVisible' },
  { request: 'masque temporairement cet élément', expected: 'node.setVisible' },
  { request: 'change the filename without moving it', expected: 'file.rename' },
  {
    request: 'rends ce calque à moitié transparent',
    expected: 'layer.setOpacityBlendAndVisibility',
  },
  { request: 'garde cette préférence en mémoire pour ce projet', expected: 'memory.write' },
  { request: 'show me whether this repository has pending changes', expected: 'git.status' },
  { request: 'déclenche cet évènement à la cinquième seconde', expected: 'timeline.addSceneCue' },
  { request: 'how many media assets are in this project', expected: 'assets.counts' },
  { request: 'explain what this selected object contains', expected: 'studio.describe' },
  { request: 'change the values of this gameplay component', expected: 'component.setProperties' },
  { request: 'agrandis la zone de dessin sans toucher aux calques', expected: 'canvas.resize' },
  { request: 'turn this post-processing effect off', expected: 'post.setEffectEnabled' },
]

async function evaluate(
  request: string,
  expected: ActionName,
  scenario: string,
  scope?: ActionSearchScope,
): Promise<Evaluation> {
  const started = performance.now()
  const ranking = await service.inspect(`${request}\nPlan mission`, 12, [], scope)
  const milliseconds = performance.now() - started
  const hit = ranking.find(candidate => candidate.action.name === expected)
  if (!hit) throw new Error(`${expected} is absent from the action corpus`)
  return {
    scenario,
    request,
    expected,
    family: hit.action.family,
    rank: hit.rank,
    included: hit.included,
    score: hit.score,
    milliseconds,
    falsePositives: ranking
      .slice(0, Math.max(0, hit.rank - 1))
      .map(candidate => candidate.action.name),
    ranking: ranking.map(candidate => ({
      action: candidate.action.name,
      lexicalScore: candidate.lexicalScore,
      bm25Score: candidate.bm25Score ?? 0,
      semanticScore: candidate.semanticScore ?? null,
      scopeScore: candidate.scopeScore ?? 0,
      workflowScore: candidate.workflowScore ?? 0,
      resourceScore: candidate.resourceScore ?? 0,
      compatibilityScore: candidate.compatibilityScore ?? 0,
      intentScore: candidate.intentScore ?? 0,
      fusionScore: candidate.fusionScore ?? 0,
      relevanceScore: candidate.relevanceScore,
      applicabilityScore: candidate.applicabilityScore,
      documentAffinity: candidate.documentAffinity,
      score: candidate.score,
      rank: candidate.rank,
      included: candidate.included,
      exclusion: candidate.exclusion ?? null,
    })),
  }
}

describe('ActionIndex offline retrieval', () => {
  for (const scenario of SCENARIOS) {
    const expected = expectedMissionActions(scenario)
    if (expected.length !== 1) continue
    const action = expected[0]
    if (!action) continue
    it(scenario.name, async () => {
      const request = scenario.said.join('\n')
      const studio = await createStudio(PROJECT)
      try {
        await scenario.setup?.(studio)
        studio.settle()
        evaluations.push(
          await evaluate(
            request,
            action,
            scenario.name,
            actionSearchScope(
              await studio.snapshot(),
              request,
              availableActionTargets(studio.projectContext(), request),
            ),
          ),
        )
      } finally {
        studio.close()
      }
    })
  }

  for (const sample of GENERALIZATION_CASES)
    it(`generalizes: ${sample.request}`, async () => {
      generalization.push(await evaluate(sample.request, sample.expected, sample.request))
    })

  afterAll(async () => {
    const recalls = (limit: number): number =>
      evaluations.filter(evaluation => evaluation.rank <= limit).length / evaluations.length
    const reciprocalRanks = evaluations.map(evaluation => 1 / evaluation.rank)
    const families = ACTION_FAMILIES.map(family => {
      const values = evaluations.filter(evaluation => evaluation.family === family.name)
      return {
        family: family.name,
        evaluations: values.length,
        recallAt12:
          values.length === 0
            ? null
            : values.filter(value => value.rank <= 12).length / values.length,
        meanRank:
          values.length === 0
            ? null
            : values.reduce((total, value) => total + value.rank, 0) / values.length,
      }
    })
    const dominantFalsePositives = new Map<ActionName, number>()
    for (const evaluation of evaluations)
      for (const action of evaluation.falsePositives)
        dominantFalsePositives.set(action, (dominantFalsePositives.get(action) ?? 0) + 1)
    const latencies = evaluations.map(evaluation => evaluation.milliseconds).sort((a, b) => a - b)
    const percentile = (fraction: number): number =>
      latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * fraction))] ?? 0
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'lexical',
      corpusActions: index.count(),
      evaluationCount: evaluations.length,
      metrics: {
        recallAt1: recalls(1),
        recallAt3: recalls(3),
        recallAt5: recalls(5),
        recallAt12: recalls(12),
        mrr: reciprocalRanks.reduce((total, value) => total + value, 0) / evaluations.length,
        meanRank:
          evaluations.reduce((total, evaluation) => total + evaluation.rank, 0) /
          evaluations.length,
        latencyP50Milliseconds: percentile(0.5),
        latencyP95Milliseconds: percentile(0.95),
      },
      rankDistribution: Object.fromEntries(
        [...new Set(evaluations.map(evaluation => evaluation.rank))]
          .sort((left, right) => left - right)
          .map(rank => [rank, evaluations.filter(evaluation => evaluation.rank === rank).length]),
      ),
      dominantFalsePositives: [...dominantFalsePositives]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 20),
      families,
      evaluations,
      generalization: {
        evaluations: generalization.length,
        recallAt1: generalization.filter(value => value.rank <= 1).length / generalization.length,
        recallAt3: generalization.filter(value => value.rank <= 3).length / generalization.length,
        recallAt5: generalization.filter(value => value.rank <= 5).length / generalization.length,
        recallAt12: generalization.filter(value => value.rank <= 12).length / generalization.length,
        cases: generalization,
      },
    }
    mkdirSync(OUTPUT, { recursive: true })
    writeFileSync(join(OUTPUT, 'retrieval-baseline.json'), `${JSON.stringify(report, null, 2)}\n`)
    await service.close()
  })
})

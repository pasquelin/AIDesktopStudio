import type { ActionRanking } from '@main/actionIndex/actionIndex'
import type { ActionName } from '@shared/domain/assistant'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { actionFingerprint, type ActionCorpus } from '@main/actionIndex/actionCorpus'

export type SemanticRepresentation = 'name' | 'brief' | 'compact' | 'business'
export type SemanticMetrics = {
  evaluations: number
  recallAt1: number
  recallAt3: number
  recallAt5: number
  recallAt12: number
  mrr: number
  meanRank: number
}

export function metricsOfRanks(ranks: readonly number[]): SemanticMetrics {
  const recall = (limit: number) => ranks.filter(rank => rank <= limit).length / ranks.length
  return {
    evaluations: ranks.length,
    recallAt1: recall(1),
    recallAt3: recall(3),
    recallAt5: recall(5),
    recallAt12: recall(12),
    mrr: ranks.reduce((sum, rank) => sum + 1 / rank, 0) / ranks.length,
    meanRank: ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length,
  }
}

export function representedCorpus(
  corpus: ActionCorpus,
  representation: SemanticRepresentation,
): ActionCorpus {
  const actions = corpus.actions.map(action => ({
    ...action,
    searchable:
      representation === 'name'
        ? action.name
        : representation === 'brief'
          ? [action.title, action.description, ...action.localizedTitles].join(' ')
          : representation === 'compact'
            ? [action.family, ...action.localizedTitles, action.description].join(' ')
            : [
                action.searchable,
                ...(action.capabilities.documentKinds ?? []),
                action.capabilities.documentAffinity ?? 'transversal',
                ...action.requires,
                ...action.produces,
                ...action.inputs,
                ...action.uses,
                ...action.returns,
              ].join(' '),
  }))
  return { actions, fingerprint: actionFingerprint(actions) }
}

export type SemanticQueryVariant = 'q0' | 'q1' | 'q2' | 'q3' | 'q4'

const intentOf = (query: string): string => {
  const text = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  if (
    /(volume|gain|opacity|eclair|change|mets|regle|resize|taille|scale|pivoter|rotate)/.test(text)
  )
    return 'adjust'
  if (/(ajoute|mets.*dans|place|create|add|import)/.test(text)) return 'add'
  if (/(retire|supprime|jette|delete|remove|drop)/.test(text)) return 'remove'
  if (/(montre|donne|quelles|combien|info|historique)/.test(text)) return 'read'
  return 'act'
}

const domainOf = (query: string, snapshot: StudioSnapshot): string => {
  const text = query.toLowerCase()
  if (/(stash|version|depot|prepare|git)/.test(text)) return 'git'
  if (/(volume|clip|montage|audio)/.test(text)) return 'montage audio'
  if (/(1080|calque|canvas|image|dessin)/.test(text)) return 'canvas'
  if (/(camera|scene|voiture|modele|personnage|eclair)/.test(text)) return 'scene'
  return snapshot.activeDocumentState?.kind ?? snapshot.workspace
}

export function expandedQueries(
  query: string,
  snapshot: StudioSnapshot,
): Record<SemanticQueryVariant, string> {
  const domain = domainOf(query, snapshot)
  const intent = intentOf(query)
  const active = snapshot.activeDocumentState?.kind ?? 'none'
  const selection = snapshot.selection?.kind ?? 'none'
  const documents =
    snapshot.documents
      .filter(document => document.active)
      .map(document => document.kind)
      .join(', ') || 'none'
  return {
    q0: query,
    q1: `${query}\ndomain: ${domain}`,
    q2: `${query}\nintent: ${intent}`,
    q3: `${query}\ndomain: ${domain}\nintent: ${intent}`,
    q4: `${query}\ndomain: ${domain}\nintent: ${intent}\nactive document: ${active}\nworkspace: ${snapshot.workspace}\nselection: ${selection}\nopened active documents: ${documents}\nproject: ${snapshot.project ? 'present' : 'none'}`,
  }
}

export async function queryVariantResults(
  variants: Record<SemanticQueryVariant, string>,
  expectedAction: ActionName,
  rankingFor: (text: string) => Promise<readonly ActionRanking[]>,
): Promise<
  Record<
    SemanticQueryVariant,
    {
      text: string
      rank: number
      cosine: number
      top5: readonly { name: ActionName; cosine: number }[]
      all: readonly { name: ActionName; cosine: number; family: string }[]
    }
  >
> {
  const results = {} as Record<
    SemanticQueryVariant,
    {
      text: string
      rank: number
      cosine: number
      top5: readonly { name: ActionName; cosine: number }[]
      all: readonly { name: ActionName; cosine: number; family: string }[]
    }
  >
  for (const [variant, text] of Object.entries(variants) as [SemanticQueryVariant, string][]) {
    const ranking = await rankingFor(text)
    const expected = ranking.find(hit => hit.action.name === expectedAction)
    results[variant] = {
      text,
      rank: ranking.findIndex(hit => hit.action.name === expectedAction) + 1,
      cosine: expected?.semanticScore ?? 0,
      top5: semanticCandidatesOf(ranking, 5),
      all: semanticScoresOf(ranking),
    }
  }
  return results
}

export function semanticCandidatesOf(
  ranking: readonly ActionRanking[],
  limit = 12,
): readonly { name: ActionName; cosine: number }[] {
  return ranking
    .filter(hit => hit.action.name !== 'actions.find')
    .slice(0, limit)
    .map(hit => ({ name: hit.action.name, cosine: hit.semanticScore ?? 0 }))
}

export function semanticScoresOf(
  ranking: readonly ActionRanking[],
): readonly { name: ActionName; cosine: number; family: string }[] {
  return ranking
    .filter(hit => hit.action.name !== 'actions.find')
    .map(hit => ({
      name: hit.action.name,
      cosine: hit.semanticScore ?? 0,
      family: hit.action.family,
    }))
}

export function candidateUnionRank(
  algorithmic: readonly ActionRanking[],
  semantic: readonly ActionRanking[],
  limit: number,
  action: ActionName,
): number {
  const names = new Set(
    [
      ...algorithmic.filter(hit => hit.action.name !== 'actions.find').slice(0, limit),
      ...semantic.filter(hit => hit.action.name !== 'actions.find').slice(0, limit),
    ].map(hit => hit.action.name),
  )
  const ranking = algorithmic
    .filter(hit => names.has(hit.action.name))
    .sort((left, right) => right.score - left.score || left.action.ordinal - right.action.ordinal)
  const position = ranking.findIndex(hit => hit.action.name === action)
  return position < 0 ? limit * 2 + 1 : position + 1
}

type DiagnosticCase = {
  scenarioId: string
  request: string
  expectedAction: ActionName
  semanticQuery: string
  semanticTop: readonly { name: ActionName; cosine: number }[]
  semanticScore: number
  ranks: Record<'algorithmic' | 'semantic' | 'rrf' | 'hybrid', number>
  difficult: boolean
}

export function diagnosticMarkdown(
  documents: readonly { name: ActionName; text: string }[],
  results: readonly DiagnosticCase[],
): string {
  const texts = new Map(documents.map(document => [document.name, document.text]))
  const cases = results
    .filter(result => result.difficult)
    .map(result => {
      const candidates = result.semanticTop
        .slice(0, 10)
        .map(
          (candidate, index) =>
            `${index + 1}. ${candidate.name} — ${candidate.cosine.toFixed(4)}\n\n${texts.get(candidate.name) ?? ''}`,
        )
        .join('\n\n')
      return `## ${result.scenarioId}\n\nUSER REQUEST\n\n${result.request}\n\nSEMANTIC QUERY SENT TO MODEL\n\n${result.semanticQuery}\n\nEXPECTED ACTION\n\n${result.expectedAction}\n\nACTION SEMANTIC DOCUMENT\n\n${texts.get(result.expectedAction) ?? ''}\n\nCOSINE / RANKS\n\n- cosine: ${result.semanticScore.toFixed(4)}\n- semantic: ${result.ranks.semantic}\n- algorithmic: ${result.ranks.algorithmic}\n- RRF: ${result.ranks.rrf}\n- hybrid: ${result.ranks.hybrid}\n\nTOP 10 SEMANTIC\n\n${candidates}`
    })
    .join('\n\n---\n\n')
  return `# Diagnostic profond Semantic Action Search\n\nMesure avec le GGUF reconstruit, non identique à l'artefact historique : les rangs ici sont reproductibles pour cette sonde, pas une nouvelle baseline.\n\n${cases}\n`
}

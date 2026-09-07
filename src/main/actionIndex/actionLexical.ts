import { actionIntents, intentOfWords, type ActionIntent } from '@shared/domain/assistant'
import type { IndexedAction } from './actionCorpus'

const INTENT_MATCH_SCORE = 2
const SPECIFIC_INTENT_MATCH_SCORE = 6
const INTENT_MISMATCH_SCORE = -0.5
const STOP_WORDS = new Set([
  'a',
  'au',
  'aux',
  'avec',
  'ce',
  'ces',
  'cette',
  'continue',
  'dans',
  'de',
  'des',
  'du',
  'en',
  'est',
  'et',
  'il',
  'je',
  'l',
  'la',
  'le',
  'les',
  'ma',
  'mes',
  'mission',
  'moi',
  'mon',
  'ne',
  'pas',
  'plan',
  'pour',
  'que',
  'qui',
  'result',
  'sa',
  'son',
  'sur',
  'the',
  'to',
  'un',
  'une',
  'verify',
  'with',
])

const QUERY_INTENTS: Readonly<Record<ActionIntent, readonly string[]>> = {
  read: [
    'quel',
    'combien',
    'liste',
    'donne',
    'decri',
    'what',
    'which',
    'how',
    'list',
    'show',
    'describe',
  ],
  create: [
    'crea',
    'cree',
    'ajout',
    'gener',
    'nouveau',
    'nouvelle',
    'make',
    'create',
    'add',
    'generate',
    'new',
  ],
  mutate: [
    'modifi',
    'change',
    'renomm',
    'deplac',
    'tourne',
    'mets',
    'regle',
    'set',
    'rename',
    'move',
    'update',
    'adjust',
    'activ',
  ],
  delete: ['supprim', 'retire', 'efface', 'oublie', 'delete', 'remove', 'trash', 'forget', 'clear'],
  search: ['cherch', 'trouve', 'find', 'search', 'browse'],
  execute: [
    'lance',
    'execute',
    'ouvre',
    'ouvrir',
    'ferme',
    'revien',
    'reven',
    'retour',
    'run',
    'open',
    'close',
    'return',
    'back',
    'submit',
    'play',
  ],
  remember: ['retien', 'remember', 'retain'],
}

const folded = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')

export const actionSearchWords = (value: string): readonly string[] =>
  (folded(value).match(/[\p{L}\p{N}_]+/gu) ?? []).filter(token => !STOP_WORDS.has(token))

const wordsOf = (value: string): readonly string[] => folded(value).match(/[\p{L}\p{N}_]+/gu) ?? []

export function actionIntentScore(query: string, action: IndexedAction): number {
  const queryIntent = actionQueryIntent(query)
  if (queryIntent === null) return 0
  const intents = actionIntents(action)
  if (intents.includes(queryIntent))
    return queryIntent === 'remember' ? SPECIFIC_INTENT_MATCH_SCORE : INTENT_MATCH_SCORE
  // No neutral answer any more: the guess left 81 actions without an intent, and they escaped
  // this penalty. `ACTION_INTENTS` gives every action one, so a mismatch is now always a mismatch.
  return INTENT_MISMATCH_SCORE
}

export const actionQueryIntent = (query: string): ActionIntent | null =>
  /^(?:qu est ce|ou )/.test(folded(query)) ? 'read' : intentOfWords(wordsOf(query), QUERY_INTENTS)

export const actionBm25Score = (rank?: number): number =>
  rank === undefined ? 0 : 1 / (1 + Math.exp(rank))

export function actionLexicalScore(query: string, action: IndexedAction, rank?: number): number {
  const wanted = folded(query).trim()
  const name = action.name.toLocaleLowerCase('en')
  const nameTokens = action.name
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .toLocaleLowerCase('en')
    .split(/[.:]/)
  const searchableTokens = wordsOf(action.searchable)
  const titleTokens = action.localizedTitles.flatMap(wordsOf)
  const fieldTokens = action.localizedFieldLabels.flatMap(wordsOf)
  let score = actionBm25Score(rank)
  if (name === wanted) score += 12
  else if (name.startsWith(wanted)) score += 7
  if (nameTokens.some(token => token === wanted)) score += 4
  if (action.family === wanted) score += 2
  for (const token of actionSearchWords(wanted)) {
    score += nameTokens.some(nameToken => nameToken.startsWith(token)) ? 1.5 : 0
    if (action.title.toLocaleLowerCase('en').includes(token)) score += 0.75
    if (token.length < 4) continue
    const prefix = token.slice(0, 4)
    if (searchableTokens.some(candidate => candidate.startsWith(prefix))) score += 0.5
    if (titleTokens.some(candidate => candidate.startsWith(prefix))) score += 2
    if (fieldTokens.some(candidate => candidate.startsWith(prefix))) score += 1.5
  }
  return score
}

import type { DocumentKind } from './document'
import type { TargetKind } from './target'

export type ActionIntent =
  'read' | 'create' | 'mutate' | 'delete' | 'search' | 'execute' | 'remember'
export type ActionDocumentAffinity = 'required' | 'relevant' | 'transversal'
export type ActionTarget =
  | TargetKind
  | 'asset'
  | 'bone'
  | 'camera'
  | 'chat'
  | 'clip'
  | 'component'
  | 'document'
  | 'file'
  | 'favorite'
  | 'generation'
  | 'git'
  | 'job'
  | 'media'
  | 'memory'
  | 'project'
  | 'projectContext'
  | 'rig'
  | 'studio'
  | 'timeline'
  | 'track'
  | 'world'

export type ActionCapabilities = {
  intents?: readonly ActionIntent[]
  targets?: readonly ActionTarget[]
  documentKinds?: readonly DocumentKind[]
  documentAffinity?: ActionDocumentAffinity
}

export type ActionTargetDescriptor = {
  target: ActionTarget
  namespaces: readonly string[]
  names: readonly string[]
}

export const ACTION_TARGET_DESCRIPTORS: readonly ActionTargetDescriptor[] = [
  { target: 'asset', namespaces: ['asset', 'assets'], names: [] },
  { target: 'bone', namespaces: ['bone'], names: ['bone', 'bones', 'os'] },
  { target: 'camera', namespaces: ['camera'], names: ['camera', 'cameras'] },
  { target: 'chat', namespaces: ['chat'], names: ['chat', 'discussion'] },
  { target: 'clip', namespaces: ['clip'], names: ['clip', 'clips', 'plan', 'plans'] },
  {
    target: 'component',
    namespaces: ['component'],
    names: ['component', 'components', 'composant', 'composants'],
  },
  { target: 'document', namespaces: ['document'], names: [] },
  {
    target: 'favorite',
    namespaces: ['favorite', 'favorites'],
    names: ['favorite', 'favorites', 'favourite', 'favourites', 'favori', 'favoris'],
  },
  { target: 'file', namespaces: ['file', 'files'], names: [] },
  { target: 'git', namespaces: ['git'], names: ['git', 'stash', 'stashes'] },
  { target: 'job', namespaces: ['job'], names: [] },
  { target: 'media', namespaces: ['media'], names: ['media', 'medias'] },
  {
    target: 'memory',
    namespaces: ['memory'],
    names: ['memory', 'memoire', 'souvenir', 'souvenirs'],
  },
  { target: 'project', namespaces: ['project', 'projects'], names: [] },
  { target: 'rig', namespaces: ['rig'], names: ['rig', 'skeleton', 'squelette'] },
  { target: 'studio', namespaces: ['studio'], names: [] },
  { target: 'timeline', namespaces: [], names: ['timeline', 'cinematique'] },
  { target: 'track', namespaces: ['track'], names: ['track', 'tracks', 'piste', 'pistes'] },
  {
    target: 'world',
    namespaces: ['world'],
    names: [
      'world',
      'environment',
      'environnement',
      'fog',
      'brouillard',
      'ground',
      'sol',
      'background',
      'arriere-plan',
    ],
  },
]

/** Most specific last: a name that says `read` and `find` is a search, and a query likewise. */
export const ACTION_INTENT_ORDER: readonly ActionIntent[] = [
  'read',
  'create',
  'mutate',
  'delete',
  'search',
  'execute',
  'remember',
]

/** The verbs an action name opens with, per intent — the index and the runtime read the same list. */
export const ACTION_NAME_INTENTS: Readonly<Record<ActionIntent, readonly string[]>> = {
  read: [
    'state',
    'list',
    'get',
    'read',
    'report',
    'describe',
    'docs',
    'facts',
    'counts',
    'status',
    'log',
  ],
  create: ['create', 'add', 'prepare', 'duplicate', 'copy', 'group'],
  mutate: [
    'set',
    'rename',
    'move',
    'transform',
    'resize',
    'update',
    'adjust',
    'apply',
    'attach',
    'bind',
    'reorder',
    'trim',
    'split',
    'write',
  ],
  delete: ['remove', 'delete', 'trash', 'forget', 'clear', 'detach', 'ungroup'],
  search: ['search', 'find', 'browse', 'explore'],
  execute: ['run', 'submit', 'open', 'close', 'play', 'step', 'cancel', 'wait'],
  remember: ['remember', 'retain'],
}

/** The intent of the earliest token that opens with a known verb; ties go to the earlier intent. */
export function intentOfWords(
  tokens: readonly string[],
  vocabulary: Readonly<Record<ActionIntent, readonly string[]>>,
): ActionIntent | null {
  let found: { intent: ActionIntent; position: number } | null = null
  for (const intent of ACTION_INTENT_ORDER) {
    const position = tokens.findIndex(token =>
      vocabulary[intent].some(prefix => token.startsWith(prefix)),
    )
    if (position >= 0 && (found === null || position < found.position)) found = { intent, position }
    // Nothing later can beat position 0, and ties already go to the earlier intent: the scan of
    // the remaining intents and their prefixes only confirms it. Measured on ten names, identical
    // results: 469 `startsWith` fall to 309, and the run from 556 ms to 364 over 2 M calls.
    if (found?.position === 0) return found.intent
  }
  return found?.intent ?? null
}

type IntentBearer = { name: string; capabilities?: ActionCapabilities }

/** Declared intents first; otherwise the one the verb of the name says, or none. */
export function actionIntents(action: IntentBearer): readonly ActionIntent[] {
  if (action.capabilities?.intents) return action.capabilities.intents
  const intent = intentOfWords(
    [(action.name.split('.')[1] ?? '').toLowerCase()],
    ACTION_NAME_INTENTS,
  )
  return intent === null ? [] : [intent]
}

/**
 * Answers and changes nothing — the mission runtime plans after one, and verifies after anything
 * else. Not `commitment: 'none'`, which `node.remove` declares too.
 */
export function actionReads(action: IntentBearer): boolean {
  const intents = actionIntents(action)
  return intents.length > 0 && intents.every(intent => intent === 'read' || intent === 'search')
}

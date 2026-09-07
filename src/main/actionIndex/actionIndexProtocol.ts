import { isRecord } from '@shared/guards'
import type { ThreadReady } from '@main/threadReady'
import type { ActionCorpus } from './actionCorpus'
import type {
  ActionEmbedding,
  ActionHit,
  ActionRanking,
  ActionRebuild,
  ActionSearch,
} from './actionIndex'

export type ActionIndexRequest =
  | { id: number; op: 'rebuild'; corpus: ActionCorpus }
  | { id: number; op: 'writeEmbeddings'; embeddings: readonly ActionEmbedding[] }
  | { id: number; op: 'search'; search: ActionSearch }
  | { id: number; op: 'inspect'; search: ActionSearch }
  | { id: number; op: 'fingerprint' }
  | { id: number; op: 'embeddingModel' }
  | { id: number; op: 'count' }
  | { id: number; op: 'close' }

export type ActionIndexResults = {
  rebuild: ActionRebuild
  writeEmbeddings: void
  search: readonly ActionHit[]
  inspect: readonly ActionRanking[]
  fingerprint: string | null
  embeddingModel: string | null
  count: number
  close: void
}

export type ActionIndexOp = ActionIndexRequest['op']
export type ActionIndexResponse =
  { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string }
export type ActionIndexReady = ThreadReady

export function isActionIndexReady(message: unknown): message is ActionIndexReady {
  return isRecord(message) && 'ready' in message
}

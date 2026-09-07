import { askExpression, matchExpression } from '@main/project/ftsMatch'
import type { SqlValue } from '@main/project/sqlite'
import { escapeLike, holes } from '@main/project/sqlText'
import type { MemoryQuery } from '@shared/domain/assistantMemory'

export type MemoryQueryParts = {
  conditions: string[]
  params: SqlValue[]
  match: string | null
}

function appendTypes(query: MemoryQuery, conditions: string[], params: SqlValue[]): void {
  if (!query.types || query.types.length === 0) return
  conditions.push(`m.type IN (${holes(query.types.length)})`)
  params.push(...query.types)
}

function appendStates(query: MemoryQuery, conditions: string[], params: SqlValue[]): void {
  if (!query.states || query.states.length === 0) return
  conditions.push(`m.state IN (${holes(query.states.length)})`)
  params.push(...query.states)
}

function appendRefs(query: MemoryQuery, conditions: string[], params: SqlValue[]): void {
  if (!query.refs || query.refs.length === 0) return
  const anchors = query.refs.map(() => '(kind = ? AND ref = ?)').join(' OR ')
  conditions.push(`m.id IN (SELECT memory_id FROM memory_refs WHERE ${anchors})`)
  for (const ref of query.refs) params.push(ref.kind, ref.ref)
}

export function memoryQueryParts(query: MemoryQuery, asking: boolean): MemoryQueryParts {
  const conditions: string[] = []
  const params: SqlValue[] = []
  appendTypes(query, conditions, params)
  appendStates(query, conditions, params)
  appendRefs(query, conditions, params)

  const wanted = query.text?.trim() ?? ''
  const match = wanted.length > 0 ? (asking ? askExpression : matchExpression)(wanted) : null
  if (wanted.length > 0 && match === null) {
    conditions.push(`(m.summary LIKE ? ESCAPE '\\' OR m.body LIKE ? ESCAPE '\\')`)
    params.push(`%${escapeLike(wanted)}%`, `%${escapeLike(wanted)}%`)
  }
  return { conditions, params, match }
}

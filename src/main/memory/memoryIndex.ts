import {
  MEMORY_PAGE,
  MEMORY_REF_KINDS,
  MEMORY_SOURCE_KINDS,
  MEMORY_STATES,
  MEMORY_TYPES,
  type Memory,
  type MemoryQuery,
  type MemoryRef,
  type MemoryRefKind,
  MEMORY_ANSWERING_STATES,
} from '@shared/domain/assistantMemory'
import { oneOf } from '@shared/guards'
import { chunk } from '@shared/collections'
import type { SqliteDriver, SqliteStatement, SqlRow } from '@main/project/sqlite'
import { migrateTo, transaction } from '@main/project/sqlMigrate'
import { holes } from '@main/project/sqlText'
import { bytes, number, optionalText, text } from '@main/project/sqlRow'
import { digestOf, dotOfBytes, embeddedTextOf, packed } from './vectors'
import { rankedRecall, type RecallCandidate } from './recallScore'

import type { MemoryIndex, RecallAsk } from './memoryIndexContract'
import { MIGRATIONS } from './memoryIndexSchema'
import { memoryQueryParts } from './memoryQuery'
import { prepareMemoryStatements } from './memoryStatements'

const COLUMN_NAMES: readonly string[] = [
  'id',
  'type',
  'summary',
  'body',
  'importance',
  'created_at',
  'used_at',
  'source_kind',
  'source_ref',
  'state',
  'supersedes',
  'text_digest',
]

const COLUMNS = COLUMN_NAMES.join(', ')
const ALIASED = COLUMN_NAMES.map(column => `m.${column}`).join(', ')

/** How many each voice may put forward. Ranking a hundred costs nothing; reading them does. */
const RECALL_CANDIDATES = 40

/**
 * 🛑 One placeholder per id, and SQLite takes 32 766 of them. Compaction reads every memory at
 * once, so an unbounded `IN (…)` threw past that count — which failed the whole thread, not just
 * the query. Well under, because the limit is a build option a driver may lower.
 */
const IDS_PER_QUERY = 500

/**
 * 🛑 What a recall may answer with. `archived` is absent, and that IS what archiving means: the
 * panel still lists it and the file still holds it, but the assistant stops being given it.
 * Without this a memory the person had set aside came back in the briefing beside its replacement.
 */
const ANSWERING = {
  states: MEMORY_ANSWERING_STATES,
  limit: RECALL_CANDIDATES,
} satisfies MemoryQuery

const byBatch = (
  ids: readonly string[],
  ask: (batch: readonly string[]) => readonly SqlRow[],
): readonly SqlRow[] => chunk([...ids], IDS_PER_QUERY).flatMap(ask)

const isRefKind = (value: string): value is MemoryRefKind =>
  MEMORY_REF_KINDS.some(kind => kind === value)

/**
 * A row back as a memory. Every closed union is checked rather than cast: a column is a free
 * string in SQLite, and a value written by a newer studio must not become a type this one denies.
 */
function memoryOf(row: SqlRow, refs: readonly MemoryRef[], links: readonly string[]): Memory {
  const sourceRef = optionalText(row, 'source_ref')
  const usedAt = optionalText(row, 'used_at')
  const supersedes = optionalText(row, 'supersedes')

  return {
    id: text(row, 'id'),
    type: oneOf(MEMORY_TYPES, text(row, 'type'), 'decision'),
    summary: text(row, 'summary'),
    body: text(row, 'body'),
    importance: number(row, 'importance'),
    createdAt: text(row, 'created_at'),
    ...(usedAt === undefined ? {} : { usedAt }),
    source: {
      kind: oneOf(MEMORY_SOURCE_KINDS, text(row, 'source_kind'), 'import'),
      ...(sourceRef === undefined ? {} : { ref: sourceRef }),
    },
    refs,
    links,
    state: oneOf(MEMORY_STATES, text(row, 'state'), 'live'),
    ...(supersedes === undefined ? {} : { supersedes }),
  }
}

export function createMemoryIndex(driver: SqliteDriver): MemoryIndex {
  migrateTo(driver, MIGRATIONS)
  const statements = prepareMemoryStatements(driver, COLUMNS, ALIASED, COLUMN_NAMES.length)

  const write = (memory: Memory): void => {
    /**
     * 🛑 Deleted then inserted, never `INSERT OR REPLACE`: a REPLACE does not fire the `AFTER
     * DELETE` trigger unless `recursive_triggers` is on, so the OLD words stayed in the fts5
     * table for ever. Measured — the replaced word still matched at its dead rowid, the corpus
     * grew by one on every amend, and `integrity-check` reported nothing. bm25 scores against a
     * corpus of ghosts. The cascade takes the refs and the links with the row.
     */
    statements.deleteMemory.run(memory.id)
    statements.insertMemory.run(
      memory.id,
      memory.type,
      memory.summary,
      memory.body,
      memory.importance,
      memory.createdAt,
      memory.usedAt ?? null,
      memory.source.kind,
      memory.source.ref ?? null,
      memory.state,
      memory.supersedes ?? null,
      digestOf(embeddedTextOf(memory.summary, memory.body)),
    )
    for (const ref of memory.refs) statements.insertRef.run(memory.id, ref.kind, ref.ref)
    for (const link of memory.links) statements.insertLink.run(memory.id, link)
  }

  /**
   * One anchor table for a page, grouped by the column naming the memory it hangs off. Ordered
   * outright: an anchor list whose order moves between reads is a panel row redrawing for nothing.
   */
  const anchors = <T>(
    ids: readonly string[],
    one: SqliteStatement,
    key: string,
    many: (holders: string) => string,
    read: (row: SqlRow) => T | null,
  ): Map<string, T[]> => {
    const held = new Map<string, T[]>()
    const rows = byBatch(ids, batch =>
      batch.length === 1
        ? one.all(...batch)
        : driver.prepare(many(holes(batch.length))).all(...batch),
    )

    for (const row of rows) {
      const value = read(row)
      if (value === null) continue

      const id = text(row, key)
      const kept = held.get(id) ?? []
      kept.push(value)
      held.set(id, kept)
    }
    return held
  }

  /** The refs and the links of a whole page, in two queries rather than two per row. */
  const attach = (rows: readonly SqlRow[]): readonly Memory[] => {
    if (rows.length === 0) return []

    const ids = rows.map(row => text(row, 'id'))

    const refs = anchors(
      ids,
      statements.readOneRefs,
      'memory_id',
      holders => `SELECT memory_id, kind, ref FROM memory_refs
                  WHERE memory_id IN (${holders}) ORDER BY memory_id, kind, ref`,
      row => {
        const kind = text(row, 'kind')
        return isRefKind(kind) ? { kind, ref: text(row, 'ref') } : null
      },
    )

    const links = anchors(
      ids,
      statements.readOneLinks,
      'from_id',
      holders => `SELECT from_id, to_id FROM memory_links
                  WHERE from_id IN (${holders}) ORDER BY from_id, to_id`,
      row => text(row, 'to_id'),
    )

    return rows.map(row =>
      memoryOf(row, refs.get(text(row, 'id')) ?? [], links.get(text(row, 'id')) ?? []),
    )
  }

  const listed = (query: MemoryQuery, asking = false): readonly Memory[] => {
    const { conditions, params, match } = memoryQueryParts(query, asking)
    const filters = conditions.join(' AND ')
    const limit = query.limit ?? MEMORY_PAGE

    /**
     * Ranked by fts5 when the query has words, by weight otherwise: `rank` IS bm25, and it is
     * the one ordering that answers « which of these is about what was asked ».
     */
    const sql =
      match === null
        ? `SELECT ${ALIASED} FROM memories m ${filters ? `WHERE ${filters}` : ''}
           ORDER BY m.importance DESC, m.created_at DESC, m.id DESC LIMIT ?`
        : `SELECT ${ALIASED} FROM memories_fts f JOIN memories m ON m.rowid = f.rowid
           WHERE memories_fts MATCH ? ${filters ? `AND ${filters}` : ''}
           ORDER BY f.rank LIMIT ?`

    const bound = match === null ? [...params, limit] : [match, ...params, limit]
    return attach(driver.prepare(sql).all(...bound))
  }

  /** The ids whose vectors are closest to the question, best first, with how close they came. */
  const closestTo = (
    model: string,
    question: Float32Array,
    top: number,
  ): readonly { id: string; similarity: number }[] => {
    const scored = statements.sweepVectorsOf.all(model).map(row => ({
      id: text(row, 'memory_id'),
      similarity: dotOfBytes(bytes(row, 'vector'), question),
    }))

    return scored.sort((one, other) => other.similarity - one.similarity).slice(0, top)
  }

  const readMany = (ids: readonly string[]): readonly Memory[] =>
    ids.length === 0
      ? []
      : attach(
          driver
            .prepare(`SELECT ${COLUMNS} FROM memories WHERE id IN (${holes(ids.length)})`)
            .all(...ids),
        )

  /**
   * The four voices, gathered into one candidate per memory. Merged rather than concatenated: a
   * memory the words AND the meaning both found must be scored once, carrying both signals.
   */
  const gathered = (ask: RecallAsk): readonly RecallCandidate[] => {
    const candidates = new Map<string, RecallCandidate>()
    const hold = (memory: Memory): RecallCandidate => {
      const held = candidates.get(memory.id) ?? { memory }
      candidates.set(memory.id, held)
      return held
    }

    // Pinned first, so what the person decided to always give is in the set whatever it scores.
    for (const memory of listed({ states: ['pinned'], limit: RECALL_CANDIDATES })) hold(memory)

    if (ask.refs && ask.refs.length > 0) {
      for (const memory of listed({ ...ANSWERING, refs: ask.refs })) hold(memory)
    }

    if (ask.text.trim().length > 0) {
      const found = listed({ ...ANSWERING, text: ask.text }, true)
      found.forEach((memory, rank) => {
        hold(memory).exactRank = rank
      })
    }

    if (ask.question && ask.question.length > 0 && ask.model) {
      const closest = closestTo(ask.model, ask.question, RECALL_CANDIDATES)
      // 🛑 ONE read, and only of what no other voice put forward: the three above already hold
      // their rows, and reading them again joins their refs and links a second time.
      const unread = readMany(closest.filter(one => !candidates.has(one.id)).map(one => one.id))
      const held = new Map(unread.map(memory => [memory.id, memory]))

      for (const one of closest) {
        const memory = candidates.get(one.id)?.memory ?? held.get(one.id)
        if (memory === undefined || memory.state === 'archived') continue
        hold(memory).similarity = one.similarity
      }
    }

    return [...candidates.values()]
  }

  const recallWith = (ask: RecallAsk): readonly Memory[] =>
    rankedRecall(gathered(ask), { ...(ask.refs && { refs: ask.refs }), now: ask.now })
      .slice(0, ask.limit)
      .map(one => one.memory)

  return {
    put: memory => transaction(driver, () => write(memory)),

    putAll: memories => transaction(driver, () => memories.forEach(write)),

    remove: id => {
      // The cascade takes the refs and the links, and the fts5 trigger takes the words. The
      // vector is NOT cascaded — see the migration — so forgetting says so itself.
      statements.deleteMemory.run(id)
      statements.dropVector.run(id)
    },

    count: () => number(statements.countMemories.get() ?? {}, 'held'),

    standingOn: (type, ref) => {
      const row = statements.readStanding.get(ref.kind, ref.ref, type)
      return row ? (attach([row])[0] ?? null) : null
    },

    read: id => {
      const row = statements.readMemory.get(id)
      return row ? (attach([row])[0] ?? null) : null
    },

    list: listed,

    served: () =>
      new Map(statements.readServed.all().map(row => [text(row, 'id'), text(row, 'used_at')])),

    markUsed: (ids, at) => {
      if (ids.length === 0) return

      driver
        .prepare(`UPDATE memories SET used_at = ? WHERE id IN (${holes(ids.length)})`)
        .run(at, ...ids)
    },

    stamp: () => {
      const row = statements.readStamp.get()
      return row ? { bytes: number(row, 'bytes'), modifiedAt: number(row, 'modified_at') } : null
    },

    restamp: ({ bytes, modifiedAt }) =>
      transaction(driver, () => {
        statements.dropStamp.run()
        statements.writeStamp.run(bytes, modifiedAt)
      }),

    // Through `memories` alone: the fts5 triggers fire on the delete, and the cascade takes the
    // refs and the links. An index emptied table by table would keep every word it ever read.
    clear: () =>
      transaction(driver, () => {
        statements.dropAll.run()
        statements.dropStamp.run()
      }),

    writeVectors: vectors =>
      transaction(driver, () => {
        for (const one of vectors) {
          statements.writeVector.run(one.memoryId, one.digest, one.model, packed(one.values))
        }
      }),

    withoutVector: (model, limit) =>
      statements.readPending.all(model, limit).map(row => ({
        id: text(row, 'id'),
        text: embeddedTextOf(text(row, 'summary'), text(row, 'body')),
        // Read rather than recomputed: the column is what the join compares, so hashing the two
        // halves a second time here is one more chance for the two answers to disagree.
        digest: text(row, 'text_digest'),
      })),

    pendingVectors: model => number(statements.countPending.get(model) ?? {}, 'held'),

    dropOtherVectors: model => {
      statements.dropOther.run(model)
    },

    recall: recallWith,

    // Run after a rebuild, never during one: `clear` deliberately spares the vectors, so what a
    // file no longer holds is only known once the file has been read back whole.
    sweepVectors: () => {
      statements.dropOrphans.run()
    },

    close: () => driver.close(),
  }
}

export type { MemoryIndex, MemoryStamp, RecallAsk } from './memoryIndexContract'

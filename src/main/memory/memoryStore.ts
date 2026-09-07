import { appendFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  isReadable,
  MEMORY_VERSION,
  type Memory,
  type MemoryDraft,
  type MemoryPatch,
  type MemoryQuery,
  type MemoryTrouble,
} from '@shared/domain/assistantMemory'
import { defined } from '@shared/guards'
import { orElse } from '@shared/promises'
import { isMissing, writeAtomic, writeQueue } from '@main/persistence'
import type { MemoryIndex, MemoryStamp, RecallAsk } from './memoryIndex'
import type { MemoryVector, PendingVector } from './vectors'
import { parseMemory, versionOf } from './validation'
export type MemoryStore = {
  remember: (draft: MemoryDraft) => Promise<Memory>
  amend: (id: string, patch: MemoryPatch) => Promise<Memory | null>
  forget: (id: string) => Promise<boolean>
  read: (id: string) => Promise<Memory | null>
  list: (query: MemoryQuery) => Promise<readonly Memory[]>
  count: () => Promise<number>
  markUsed: (ids: readonly string[]) => Promise<void>
  recall: (ask: RecallAsk) => Promise<readonly Memory[]>
  writeVectors: (vectors: readonly MemoryVector[]) => Promise<void>
  withoutVector: (model: string, limit: number) => Promise<readonly PendingVector[]>
  pendingVectors: (model: string) => Promise<number>
  dropOtherVectors: (model: string) => Promise<void>
  rebuild: () => Promise<number>
  refresh: () => Promise<number>
  compact: () => Promise<number>
  reset: () => Promise<void>
  trouble: () => MemoryTrouble | null
  close: () => Promise<void>
}
export type MemoryStoreDeps = {
  file: string
  index: MemoryIndex
  now: () => string
  newId: () => string
}
const lineOf = (memory: Memory): string =>
  `${JSON.stringify({ v: MEMORY_VERSION, ...memory, usedAt: undefined })}\n`
async function stampOf(file: string): Promise<MemoryStamp | null> {
  const stats = await orElse(stat(file), null)
  return stats && { bytes: stats.size, modifiedAt: Math.trunc(stats.mtimeMs) }
}
async function linesIn(file: string): Promise<number> {
  const body = await orElse(readFile(file, 'utf8'), '')
  return body.split('\n').filter(line => line.trim().length > 0).length
}
export function hasMoved(held: MemoryStamp | null, now: MemoryStamp | null): boolean {
  if (held === null || now === null) return true
  return held.bytes !== now.bytes || held.modifiedAt !== now.modifiedAt
}
const archivedOf = (memory: Memory): Memory => ({ ...memory, state: 'archived' })
function supersededBy(index: MemoryIndex, draft: MemoryDraft): Memory | null {
  const anchor = draft.refs?.[0]
  return anchor ? index.standingOn(draft.type, anchor) : null
}

function memoriesIn(body: string): {
  held: Map<string, Memory>
  trouble: MemoryTrouble | null
  spelt: number
} {
  const held = new Map<string, Memory>()
  let trouble: MemoryTrouble | null = null
  let spelt = 0
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    spelt += 1
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      trouble ??= 'unreadable'
      continue
    }
    const version = versionOf(value)
    if (version === null) {
      trouble ??= 'unreadable'
      continue
    }
    if (version > MEMORY_VERSION) {
      trouble = 'too-new'
      continue
    }
    const memory = parseMemory(value)
    if (!memory) {
      trouble ??= 'unreadable'
      continue
    }
    held.set(memory.id, memory)
  }
  return { held, trouble, spelt }
}
export function createMemoryStore({ file, index, now, newId }: MemoryStoreDeps): MemoryStore {
  const writes = writeQueue()
  let trouble: MemoryTrouble | null = null
  let spelt: number | null = null
  let readHere = false
  let folder: Promise<unknown> | null = null
  const append = async (...memories: readonly Memory[]): Promise<void> => {
    try {
      folder ??= mkdir(dirname(file), { recursive: true })
      await folder
    } catch (error) {
      folder = null
      throw error
    }
    await appendFile(file, memories.map(lineOf).join(''), 'utf8')
    if (spelt !== null) spelt += memories.length
    const stamp = await stampOf(file)
    if (stamp) index.restamp(stamp)
  }
  const readFileInto = async (): Promise<number> => {
    trouble = null
    readHere = true
    spelt = 0
    let body: string
    try {
      body = await readFile(file, 'utf8')
    } catch (error) {
      if (isMissing(error)) {
        index.clear()
        index.sweepVectors()
        return 0
      }
      trouble = 'unreadable'
      index.clear()
      return 0
    }
    const parsed = memoriesIn(body)
    trouble = parsed.trouble
    spelt = parsed.spelt
    const served = index.served()
    const standing = [...parsed.held.values()]
      .filter(isReadable)
      .map(memory => ({ ...memory, ...defined({ usedAt: served.get(memory.id) }) }))
    index.clear()
    index.putAll(standing)
    index.sweepVectors()
    const stamp = await stampOf(file)
    if (stamp) index.restamp(stamp)
    return standing.length
  }
  return {
    remember: draft =>
      writes.next(async () => {
        const replaced = supersededBy(index, draft)
        const memory: Memory = {
          ...draft,
          id: newId(),
          body: draft.body ?? '',
          createdAt: now(),
          refs: draft.refs ?? [],
          links: draft.links ?? [],
          state: draft.state ?? 'live',
          ...defined({ supersedes: replaced?.id }),
        }
        const archived = replaced && archivedOf(replaced)
        await append(...(archived ? [archived, memory] : [memory]))
        if (archived) index.put(archived)
        if (isReadable(memory)) index.put(memory)
        return memory
      }),
    amend: (id, patch) =>
      writes.next(async () => {
        const held = index.read(id)
        if (held === null) return null
        const { linkTo, ...replacing } = patch
        const amended: Memory = {
          ...held,
          ...replacing,
          ...(linkTo === undefined ? {} : { links: [...new Set([...held.links, ...linkTo])] }),
        }
        await append(amended)
        if (isReadable(amended)) index.put(amended)
        else index.remove(amended.id)
        return amended
      }),
    forget: id =>
      writes.next(async () => {
        const held = index.read(id)
        if (held === null) return false
        await append({ ...held, state: 'dropped' })
        index.remove(id)
        return true
      }),
    read: async id => index.read(id),
    list: async query => index.list(query),
    count: async () => index.count(),
    markUsed: async ids => index.markUsed(ids, now()),
    recall: async ask => index.recall(ask),
    writeVectors: async vectors => index.writeVectors(vectors),
    withoutVector: async (model, limit) => index.withoutVector(model, limit),
    pendingVectors: async model => index.pendingVectors(model),
    dropOtherVectors: async model => index.dropOtherVectors(model),
    rebuild: () => writes.next(readFileInto),
    refresh: () =>
      writes.next(async () =>
        hasMoved(index.stamp(), await stampOf(file)) ? await readFileInto() : index.count(),
      ),
    compact: () =>
      writes.next(async () => {
        if (!readHere) await readFileInto()
        if (trouble !== null) return 0
        const before = spelt ?? (await linesIn(file))
        if (before === 0) return 0
        const standing = index.list({ limit: Number.MAX_SAFE_INTEGER })
        await writeAtomic(file, standing.map(lineOf).join(''))
        spelt = standing.length
        const stamp = await stampOf(file)
        if (stamp) index.restamp(stamp)
        return Math.max(0, before - standing.length)
      }),
    reset: () =>
      writes.next(async () => {
        index.clear()
        index.sweepVectors()
        trouble = null
        spelt = 0
        readHere = true
        await rm(file, { force: true })
      }),
    trouble: () => trouble,
    close: async () => {
      await writes.settled()
      index.close()
    },
  }
}

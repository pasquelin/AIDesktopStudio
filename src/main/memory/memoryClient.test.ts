import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SqliteDriver } from '@main/project/sqlite'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import {
  createMemoryClient,
  MEMORY_CLOSED,
  type AsyncMemory,
  type MemoryPort,
} from './memoryClient'
import { dispatchMemoryRequest } from './memoryDispatch'
import { createMemoryIndex } from './memoryIndex'
import type { MemoryResponse } from './memoryProtocol'
import { createMemoryStore, type MemoryStore } from './memoryStore'

/**
 * A port over a REAL store, on this thread. What it proves is the protocol — that every operation
 * crosses it and comes back as itself — which a spawned worker would prove more slowly and no
 * better.
 */
function portOver(store: MemoryStore): { port: MemoryPort; fail: (error: Error) => void } {
  const listeners: ((response: MemoryResponse) => void)[] = []
  const failures: ((error: Error) => void)[] = []

  return {
    port: {
      postMessage: request => {
        void (async () => {
          try {
            const value = await dispatchMemoryRequest(store, request)
            for (const listener of listeners) listener({ id: request.id, ok: true, value })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            for (const listener of listeners)
              listener({ id: request.id, ok: false, error: message })
          }
        })()
      },
      onMessage: listener => listeners.push(listener),
      onFailure: listener => failures.push(listener),
      terminate: async () => {},
    },
    fail: error => failures.forEach(listener => listener(error)),
  }
}

let root: string
let database: SqliteDriver
let store: MemoryStore
let memory: AsyncMemory
let fail: (error: Error) => void

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-memory-client-'))
  let minted = 0
  database = openMemoryDatabase()
  store = createMemoryStore({
    file: join(root, '.ai-desktop-studio', 'memory.ndjson'),
    index: createMemoryIndex(database),
    now: () => '2026-08-28T10:00:00.000Z',
    newId: () => `m_${++minted}`,
  })
  const over = portOver(store)
  memory = createMemoryClient(over.port)
  fail = over.fail
})

afterEach(async () => {
  // Through the client: `close` now settles the store and shuts the database, so closing the
  // driver here as well would be closing it twice.
  await memory.close()
  await rm(root, { recursive: true, force: true })
})

const draft = { type: 'decision', summary: 'a decision', importance: 3, source: { kind: 'person' } }

describe('the memory, across the thread', () => {
  it('carries every operation there and back', async () => {
    expect(
      await memory.remember({ ...draft, type: 'decision', source: { kind: 'person' } }),
    ).toEqual(expect.objectContaining({ id: 'm_1', summary: 'a decision' }))
    expect(await memory.read('m_1')).toEqual(expect.objectContaining({ id: 'm_1' }))
    expect(await memory.list({})).toHaveLength(1)
    expect(await memory.amend('m_1', { state: 'pinned' })).toEqual(
      expect.objectContaining({ state: 'pinned' }),
    )
    expect(await memory.forget('m_1')).toBe(true)
    expect(await memory.read('m_1')).toBeNull()
    expect(await memory.trouble()).toBeNull()
    expect(await memory.rebuild()).toBe(0)
  })

  it('answers each caller with its own result, whatever order they come back in', async () => {
    await memory.remember({ ...draft, type: 'decision', source: { kind: 'person' } })
    await memory.remember({
      ...draft,
      type: 'script',
      summary: 'other',
      source: { kind: 'person' },
    })

    const [one, two] = await Promise.all([memory.read('m_1'), memory.read('m_2')])

    expect(one?.id).toBe('m_1')
    expect(two?.id).toBe('m_2')
  })

  /** 🛑 Without this, a thread that dies leaves every window waiting on a panel that never draws. */
  it('rejects everyone still waiting when the thread dies', async () => {
    const pending = memory.read('m_1')
    fail(new Error('the thread went away'))

    await expect(pending).rejects.toThrow('the thread went away')
    await expect(memory.read('m_2')).rejects.toThrow('the thread went away')
  })

  it('refuses to ask anything once it is closed', async () => {
    await memory.close()

    await expect(memory.list({})).rejects.toThrow(MEMORY_CLOSED)
  })
})

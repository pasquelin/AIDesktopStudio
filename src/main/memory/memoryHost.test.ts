import { describe, expect, it, vi } from 'vitest'
import type { AsyncMemory } from './memoryClient'
import { createMemoryHost, type MemoryHost } from './memoryHost'

const fakeMemory = (): AsyncMemory => ({
  remember: vi.fn(),
  amend: vi.fn(),
  forget: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  markUsed: vi.fn(),
  recall: vi.fn(),
  writeVectors: vi.fn(),
  withoutVector: vi.fn(),
  pendingVectors: vi.fn(),
  dropOtherVectors: vi.fn(),
  rebuild: vi.fn(),
  refresh: vi.fn(),
  compact: vi.fn(),
  reset: vi.fn(),
  trouble: vi.fn(),
  close: vi.fn(async () => {}),
})

function hostOn(open = vi.fn(async () => fakeMemory())): {
  host: MemoryHost
  open: typeof open
  troubles: string[]
} {
  const troubles: string[] = []
  return {
    host: createMemoryHost({ userData: '/machine', open, onTrouble: why => troubles.push(why) }),
    open,
    troubles,
  }
}

describe('which memory answers', () => {
  it('has none until a project is open', async () => {
    const { host, open } = hostOn()

    expect(await host.project()).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  /** 🛑 CLAUDE.md's performance rule: opening a project must not pay for a thread nobody asked. */
  it('opens nothing merely because a project was opened', async () => {
    const { host, open } = hostOn()
    host.follow('/projects/film')

    expect(open).not.toHaveBeenCalled()
  })

  it('opens the file and the index of the project that is open', async () => {
    const { host, open } = hostOn()
    host.follow('/projects/film')
    await host.project()

    expect(open).toHaveBeenCalledWith(
      '/projects/film/.ai-desktop-studio/memory.ndjson',
      '/projects/film/.index/memory.db',
    )
  })

  /** 🛑 Two writers on one SQLite file is the defect: two turns asking at once open ONE thread. */
  it('opens one thread however many callers ask at once', async () => {
    const { host, open } = hostOn()
    host.follow('/projects/film')
    await Promise.all([host.project(), host.project(), host.project()])

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens the machine memory beside a project, and only once', async () => {
    const { host, open } = hostOn()
    await Promise.all([host.global(), host.global()])

    expect(open).toHaveBeenCalledExactlyOnceWith('/machine/memory.ndjson', '/machine/memory.db')
  })
})

describe('changing project', () => {
  it('lets go of the one it held and opens the next on demand', async () => {
    const held = fakeMemory()
    const { host, open } = hostOn(vi.fn(async () => held))
    host.follow('/projects/one')
    await host.project()

    host.follow('/projects/two')
    await host.project()

    expect(held.close).toHaveBeenCalled()
    expect(open).toHaveBeenLastCalledWith(
      '/projects/two/.ai-desktop-studio/memory.ndjson',
      '/projects/two/.index/memory.db',
    )
  })

  it('does nothing at all when the same project is published again', async () => {
    const { host, open } = hostOn()
    host.follow('/projects/one')
    await host.project()
    host.follow('/projects/one')
    await host.project()

    expect(open).toHaveBeenCalledTimes(1)
  })

  it('answers nothing again once no project is open', async () => {
    const { host } = hostOn()
    host.follow('/projects/one')
    await host.project()
    host.follow(null)

    expect(await host.project()).toBeNull()
  })
})

describe('when a memory will not open', () => {
  /** 🛑 The studio has worked without a memory until now, and goes on doing so. */
  it('costs the memory and never the project', async () => {
    const { host, troubles } = hostOn(
      vi.fn(async () => {
        throw new Error('the database is locked')
      }),
    )
    host.follow('/projects/film')

    expect(await host.project()).toBeNull()
    expect(troubles).toEqual(['the database is locked'])
  })
})

describe("the machine's own memory", () => {
  /**
   * 🛑 A failure is not remembered: a database locked for a moment would otherwise disable the
   * machine's own memory for the whole SESSION, with a restart the only way back. The project
   * scope escapes this only because `follow` clears its own.
   */
  it('tries again after a failure rather than answering nothing for ever', async () => {
    let failing = true
    const open = vi.fn(async () => {
      if (failing) throw new Error('database is locked')
      return fakeMemory()
    })
    const { host, troubles } = hostOn(open)

    expect(await host.global()).toBeNull()
    expect(troubles).toHaveLength(1)

    failing = false
    expect(await host.global()).not.toBeNull()
    expect(open).toHaveBeenCalledTimes(2)
  })

  /** And a memory that DID open is held: two turns asking at once must not open two threads. */
  it('opens it once for every caller that asks', async () => {
    const { host, open } = hostOn()

    await Promise.all([host.global(), host.global()])

    expect(open).toHaveBeenCalledOnce()
  })
})

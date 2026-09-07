import { describe, expect, it, vi } from 'vitest'
import type { CodeRequest, CodeResponse } from './codeMessage'
import { createScriptCompiler } from './scriptCompiler'
import type { InputMapModule } from '@shared/domain/inputMap'

/** A worker that answers by hand, so what this measures is the CACHE and not the compiler. */
function counting(
  answer: (source: string) => { code: string } | { trouble: string; line: number },
) {
  const asked: string[] = []
  const listeners: ((event: MessageEvent<CodeResponse>) => void)[] = []
  const worker = {
    addEventListener: (name: string, listener: (event: MessageEvent<CodeResponse>) => void) => {
      if (name === 'message') listeners.push(listener)
    },
    postMessage: (message: CodeRequest) => {
      asked.push(message.source)
      const held = answer(message.source)
      const event = { data: { ...held, id: message.id } } as MessageEvent<CodeResponse>
      for (const listener of listeners) listener(event)
    },
    terminate: vi.fn(),
  }

  return { asked, compiler: createScriptCompiler(() => worker as unknown as Worker) }
}

describe('an author’s scripts, compiled once', () => {
  it('hands back what the worker made of each one', async () => {
    const { compiler } = counting(source => ({ code: `${source}!` }))

    const held = await compiler.compile([{ script: 'script:A.ts', source: 'a' }])

    expect(held.modules).toEqual([{ script: 'script:A.ts', code: 'a!' }])
  })

  /**
   * 🛑 Keyed by the DIGEST of the source, never by the path: an author saves the same file thirty
   * times an hour and plays after every save, and the compiler is nine megabytes of parsing.
   */
  it('compiles the same text once, however many scripts carry it', async () => {
    const { asked, compiler } = counting(source => ({ code: source }))

    await compiler.compile([{ script: 'script:A.ts', source: 'same' }])
    await compiler.compile([
      { script: 'script:A.ts', source: 'same' },
      { script: 'script:B.ts', source: 'same' },
      { script: 'script:C.ts', source: 'other' },
    ])

    expect(asked).toEqual(['same', 'other'])
  })

  it('recompiles when an imported input map changes', async () => {
    const { asked, compiler } = counting(source => ({ code: source }))
    const first: InputMapModule = {
      path: 'Scripts/character.input.json',
      map: { version: 1, id: 'character', priority: 0, defaultActive: true, actions: [] },
    }

    await compiler.compile([{ script: 'script:Scripts/player.ts', source: 'same' }], [first])
    await compiler.compile(
      [{ script: 'script:Scripts/player.ts', source: 'same' }],
      [{ ...first, map: { ...first.map, priority: 10 } }],
    )

    expect(asked).toEqual(['same', 'same'])
  })

  it('compiles identical relative imports once per script folder', async () => {
    const { asked, compiler } = counting(source => ({ code: source }))
    const source = "import controls from './controls.input.json'\nexport default controls"

    await compiler.compile([
      { script: 'script:Character/player.ts', source },
      { script: 'script:Vehicle/player.ts', source },
    ])

    expect(asked).toEqual([source, source])
  })

  /** Twice in ONE batch, where the cache has nothing to say yet — the batch answers for itself. */
  it('compiles one text once inside a single batch', async () => {
    const { asked, compiler } = counting(source => ({ code: source }))

    const held = await compiler.compile([
      { script: 'script:A.ts', source: 'same' },
      { script: 'script:B.ts', source: 'same' },
    ])

    expect(asked).toEqual(['same'])
    expect(held.modules).toEqual([
      { script: 'script:A.ts', code: 'same' },
      { script: 'script:B.ts', code: 'same' },
    ])
  })

  it('names what would not compile, and leaves it out of the modules', async () => {
    const { compiler } = counting(() => ({ trouble: 'node:fs', line: 2 }))

    const held = await compiler.compile([{ script: 'script:A.ts', source: 'a' }])

    expect(held.modules).toEqual([])
    expect(held.troubles).toEqual([{ script: 'script:A.ts', message: 'node:fs', line: 2 }])
  })

  /** 🛑 The refusal belongs to the TEXT, not to the one script that was sent. */
  it('names every script carrying a text that would not compile', async () => {
    const { asked, compiler } = counting(() => ({ trouble: 'node:fs', line: 2 }))

    const held = await compiler.compile([
      { script: 'script:A.ts', source: 'same' },
      { script: 'script:B.ts', source: 'same' },
    ])

    expect(asked).toEqual(['same'])
    expect(held.modules).toEqual([])
    expect(held.troubles).toEqual([
      { script: 'script:A.ts', message: 'node:fs', line: 2 },
      { script: 'script:B.ts', message: 'node:fs', line: 2 },
    ])
  })
})

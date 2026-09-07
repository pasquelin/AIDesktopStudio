import { describe, expect, it, vi } from 'vitest'
import type { EmbedClient } from './embedClient'
import { createEmbedder, type Embedder } from './embedder'
import type { EmbedWeights } from './embedChoice'

type Opened = {
  weights: string
  documentPrefix: string
  client: EmbedClient
}

function stand(
  modelId: string | null,
  { dims = 768, failing = false, slow = false, slowClose = false } = {},
): {
  embedder: Embedder
  opened: Opened[]
  closed: () => number
  /** The grace each close was given, in order — `undefined` where the client's default stands. */
  closedWith: () => (number | undefined)[]
  troubles: string[]
  die: () => void
  idle: () => void
  chose: (next: string | null) => void
  /** Lets a load that was held open settle — what makes a race testable. */
  settle: () => void
  /** Lets a graceful close finish before another process is opened. */
  settleClose: () => void
} {
  const opened: Opened[] = []
  const troubles: string[] = []
  const closedWith: (number | undefined)[] = []
  let current = modelId
  let fire: () => void = () => {}

  let killProcess: () => void = () => {}
  const parked: (() => void)[] = []
  const parkedCloses: (() => void)[] = []
  const open = (onGone: () => void): EmbedClient => {
    killProcess = onGone
    const client: EmbedClient = {
      load: async (weights, documentPrefix) => {
        opened.push({ weights, documentPrefix, client })
        if (slow) await new Promise<void>(resolve => parked.push(resolve))
        if (failing) throw new Error('no usable binary')
        return dims
      },
      embed: async texts => texts.map(() => new Float32Array([1])),
      embedQuery: async () => new Float32Array([1]),
      close: async graceMs => {
        closedWith.push(graceMs)
        if (slowClose) await new Promise<void>(resolve => parkedCloses.push(resolve))
      },
    }
    return client
  }

  return {
    opened,
    troubles,
    die: () => killProcess(),
    settle: () => {
      for (const let_go of parked.splice(0)) let_go()
    },
    settleClose: () => {
      for (const letGo of parkedCloses.splice(0)) letGo()
    },
    closed: () => closedWith.length,
    closedWith: () => closedWith,
    idle: () => fire(),
    chose: next => {
      current = next
    },
    embedder: createEmbedder({
      chosenId: () => current,
      weightsFor: (id): EmbedWeights => ({
        weights: `/models/${id}.gguf`,
        documentPrefix: id === GEMMA ? 'title: none | text: ' : '',
        queryPrefix: '',
        contextTokens: 2048,
      }),
      open,
      onTrouble: message => troubles.push(message),
      idleMs: 1000,
      schedule: (run: () => void) => {
        fire = run
        return () => {}
      },
    }),
  }
}

const GEMMA = 'embeddinggemma-300m-q8'

describe('opening', () => {
  /** 🛑 The performance rule of the lot: a project that asks nothing pays for no model. */
  it('opens nothing until something is embedded', () => {
    const { opened } = stand(GEMMA)

    expect(opened).toEqual([])
  })

  it('loads the weights the choice names, with that model’s own prefixes', async () => {
    const { embedder, opened } = stand(GEMMA)
    await embedder.embed(['the rail'])

    expect(opened).toEqual([
      expect.objectContaining({
        weights: `/models/${GEMMA}.gguf`,
        documentPrefix: 'title: none | text: ',
      }),
    ])
  })

  /** Two questions at once must not fork two processes, each loading the same 318 MB. */
  it('loads once for two callers arriving together', async () => {
    const { embedder, opened } = stand(GEMMA)
    await Promise.all([embedder.embed(['one']), embedder.embed(['two'])])

    expect(opened).toHaveLength(1)
  })

  it('embeds nothing at all when no model is chosen', async () => {
    const { embedder, opened } = stand(null)

    await expect(embedder.embed(['the rail'])).resolves.toEqual([])
    await expect(embedder.embedQuery('why?')).resolves.toEqual(new Float32Array())
    expect(opened).toEqual([])
  })

  /** A model that will not load costs the vectors, never the studio. */
  it('says so and answers nothing when the weights refuse to load', async () => {
    const { embedder, troubles } = stand(GEMMA, { failing: true })

    await expect(embedder.embed(['the rail'])).resolves.toEqual([])
    expect(troubles).toEqual(['no usable binary'])
  })
})

describe('what is chosen', () => {
  it('names the model without opening anything', () => {
    const { embedder, opened } = stand(GEMMA)

    expect(embedder.chosen()).toBe('embeddinggemma-300m-q8')
    expect(opened).toEqual([])
  })

  /** Another model is another SPACE: the old weights must go, or the addon holds both. */
  it('lets the old weights go when the choice changes', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])
    stood.chose('other')
    await stood.embedder.embed(['two'])

    expect(stood.opened.map(one => one.weights)).toEqual([
      `/models/${GEMMA}.gguf`,
      '/models/other.gguf',
    ])
    expect(stood.closed()).toBe(1)
  })

  it('lets them go when the model is chosen away entirely', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])
    stood.chose(null)

    await expect(stood.embedder.embed(['two'])).resolves.toEqual([])
    expect(stood.closed()).toBe(1)
  })
})

describe('idleness', () => {
  /** A studio left open all afternoon must not hold a gigabyte for nothing. */
  it('lets the process go after it has sat idle', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])

    stood.idle()

    expect(stood.closed()).toBe(1)
  })

  it('opens another one for the next question', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])
    stood.idle()
    await stood.embedder.embed(['two'])

    expect(stood.opened).toHaveLength(2)
  })

  it('waits for graceful disposal before opening the next process', async () => {
    const stood = stand(GEMMA, { slowClose: true })
    await stood.embedder.embed(['one'])
    stood.idle()

    const next = stood.embedder.embed(['two'])
    await Promise.resolve()
    expect(stood.opened).toHaveLength(1)

    stood.settleClose()
    await next
    expect(stood.opened).toHaveLength(2)
  })
})

describe('when the process dies on its own', () => {
  /**
   * 🛑 Without this the studio holds a dead client for ever: `ready` hands it back unchecked,
   * every call rejects, and each rejection rearms the idle timer that would have replaced it.
   */
  it('lets it go, and forks another for the next question', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])

    stood.die()
    await stood.embedder.embed(['two'])

    expect(stood.opened).toHaveLength(2)
  })
})

describe('closing', () => {
  it('kills the process it holds', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])
    await stood.embedder.close()

    expect(stood.closed()).toBe(1)
  })

  it('closes nothing when nothing was ever opened', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.close()

    expect(stood.closed()).toBe(0)
  })

  // The quit hands a short grace down; an idle release hands none and the client's default stands.
  it('passes the grace it was given on to the process', async () => {
    const stood = stand(GEMMA)
    await stood.embedder.embed(['one'])
    await stood.embedder.close(2_000)

    expect(stood.closedWith()).toEqual([2_000])
  })
})

describe('a choice that moves while the weights are loading', () => {
  /**
   * 🛑 `held` is still null while the first load is in flight, so the guard that drops another
   * model cannot fire: a caller asking for B was handed A's client, and the batch it computed
   * went into `memory_vectors` under `model = 'B'` — rows `dropOtherVectors('B')` never reaches,
   * and which satisfy the join for ever. Poisoned vectors, permanently.
   */
  it('never hands out the client of a model that is no longer chosen', async () => {
    const stood = stand(GEMMA, { slow: true })

    const first = stood.embedder.embed(['the rail'])
    stood.chose('another-model')
    const second = stood.embedder.embed(['the palette'])
    stood.settle()
    await vi.waitFor(() => expect(stood.opened).toHaveLength(2))
    stood.settle()
    await Promise.all([first, second])

    // Both weights were loaded, and the SECOND caller waited for its own rather than taking the
    // first one's: the last load is the one that was chosen.
    expect(stood.opened.map(one => one.weights)).toEqual([
      `/models/${GEMMA}.gguf`,
      '/models/another-model.gguf',
    ])
    // The first process finished loading a model nobody holds any more: closed, not leaked.
    expect(stood.closed()).toBe(1)
  })
})

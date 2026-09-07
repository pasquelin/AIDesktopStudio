import { create } from 'zustand'
import type {
  Memory,
  MemoryDraft,
  MemoryIndexing,
  MemoryPatch,
  MemoryQuery,
  MemoryScope,
} from '@shared/domain/assistantMemory'
import { MEMORY_PAGE } from '@shared/domain/assistantMemory'
import { alreadySaid, duplicatesIn, staleIn } from '@shared/domain/memoryUpkeep'
import { orElse } from '@shared/promises'
import { connectThroughBridge, memoryBridge } from '@/services/bridge'

/**
 * One amendment, against a scope the caller NAMES — what a burst holds while the person is free
 * to move the pill. `orElse`: with no bridge the call answers `undefined`, which read as success.
 */
const amendedIn = async (scope: MemoryScope, id: string, patch: MemoryPatch): Promise<boolean> =>
  (await orElse(memoryBridge()?.amend(scope, id, patch), null)) !== null

/**
 * 🛑 The scope is read ONCE, and `amendedIn` is what makes that possible: `amend` reads
 * `get().scope` on every call, so moving the pill mid-run sent the rest of the burst at the other
 * memory — the run stopped half done and reported a figure that was not true.
 */
type MemoryAmendment = readonly [id: string, patch: MemoryPatch]

const amendedAll = async (
  scope: MemoryScope,
  patches: readonly MemoryAmendment[],
): Promise<number> =>
  await burst(async () => {
    let done = 0
    for (const [id, patch] of patches) {
      if (await amendedIn(scope, id, patch)) done += 1
    }
    return done
  })

/**
 * 🛑 What makes « one reload at the end » true: this window hears its OWN amendments, so a merge
 * set off a full listing per memory, in every open window. At the module — it must not draw.
 */
let bursting = false

/** Runs a burst with its own announcements muted, and lets them through again whatever happens. */
async function burst<T>(run: () => Promise<T>): Promise<T> {
  bursting = true
  try {
    return await run()
  } finally {
    bursting = false
  }
}

/**
 * What the window holds of the two memories: a listing, never the whole of either — the file may
 * hold years of a project and nothing on screen wants all of it. See `MEMORY_PAGE`.
 */
type AssistantMemoryState = {
  memories: readonly Memory[]
  scope: MemoryScope
  query: MemoryQuery
  /** Told apart from « none held »: a panel drawn before the first answer must not say « empty ». */
  loaded: boolean
  /** Whether the panel has asked once — what makes `pending` a read per SCOPE, not per keystroke. */
  asked: boolean
  connect: () => Promise<() => void>
  look: (scope: MemoryScope, query: MemoryQuery) => Promise<void>
  reload: () => Promise<void>
  remember: (draft: MemoryDraft) => Promise<Memory | null>
  amend: (id: string, patch: MemoryPatch) => Promise<boolean>
  forget: (id: string) => Promise<boolean>
  /** Reads the file back and rebuilds the index. Answers how many memories stand once it has. */
  rebuild: () => Promise<number>
  /** Everything forgotten, the file included. The one gesture that erases rather than writes. */
  reset: () => Promise<void>
  /**
   * Keeps the best of each group of duplicates, links the rest to it and archives them. Archived
   * and not forgotten: merging is a tidying, not a judgement about what was true.
   */
  mergeDuplicates: () => Promise<number>
  /** Archives what nothing has drawn on for a season. Pinned memories are never touched. */
  archiveStale: (now: string) => Promise<number>
  /**
   * 🛑 The ONE way anything reaches the machine's memory, and a gesture the person makes: no rule
   * and no MCP client writes there, or one project's habits follow the person everywhere.
   */
  promote: (memory: Memory) => Promise<boolean>
  /** Rewrites the file with one line per standing memory. Answers how many lines it saved. */
  compact: () => Promise<number>
  /** How many memories have no vector yet, and how far a run has got. `null` while none has. */
  pending: number
  indexing: MemoryIndexing | null
  /** Starts computing what is missing, in the background, and follows it. */
  index: () => Promise<void>
  stopIndex: () => Promise<void>
}

const assistantMemoryState: AssistantMemoryState = {
  memories: [],
  asked: false,
  scope: 'project',
  query: {},
  loaded: false,
  pending: 0,
  indexing: null,

  connect: connectThroughBridge(async bridge => {
    // 🛑 Subscribing costs nothing; reloading opens a thread and a database, and the settings
    // window connects this from its root — hence only once the panel has ASKED.
    const stopChanges = bridge.memory.onChanged(scope => {
      if (
        bursting ||
        scope !== useAssistantMemory.getState().scope ||
        !useAssistantMemory.getState().loaded
      )
        return
      void useAssistantMemory.getState().reload()
    })
    const stopSteps = bridge.memory.onIndexed(progress => {
      if (progress.scope !== useAssistantMemory.getState().scope) return

      // Cleared at the end rather than left showing « 40 / 40 »: a bar that never goes away is
      // a bar that stops meaning « something is happening ».
      const done = progress.done >= progress.total
      useAssistantMemory.setState({
        indexing: done ? null : progress,
        pending: progress.total - progress.done,
      })
    })
    return () => {
      stopChanges()
      stopSteps()
    }
  }),

  look: async (scope, query) => {
    // The bar belongs to the scope that was showing: a run under way in the other one is not
    // this panel's business, and `onIndexed` filters on the scope anyway.
    const moved = scope !== useAssistantMemory.getState().scope
    useAssistantMemory.setState({ scope, query, ...(moved ? { indexing: null } : {}) })
    await useAssistantMemory.getState().reload()
    // Here and not in `reload`: what is left to embed belongs to the SCOPE, so it is read when
    // the scope changes and when the panel first asks — never on a filter the count ignores.
    if (moved || !useAssistantMemory.getState().asked) {
      useAssistantMemory.setState({
        asked: true,
        pending: await orElse(memoryBridge()?.pending(scope), 0),
      })
    }
  },

  reload: async () => {
    const { scope, query } = useAssistantMemory.getState()
    // Cleared first: a scope just changed leaves the OTHER scope's rows on screen, and `loaded`
    // saying true about them is a panel claiming they are the answer.
    useAssistantMemory.setState({ loaded: false })

    // 🛑 The listing alone: `pending` is a `LEFT JOIN` over EVERY memory of the scope and ignores
    // the query, so counting it here made each keystroke pay a scan. Read when the scope moves.
    const memories = await orElse(memoryBridge()?.list(scope, query), [])

    // 🛑 Dropped when the question moved on: two reads in flight — a scope switch, or a write
    // announced mid-switch — can settle out of order, and the slower one would paint the other
    // scope's rows and call them loaded.
    if (
      useAssistantMemory.getState().scope !== scope ||
      useAssistantMemory.getState().query !== query
    )
      return

    useAssistantMemory.setState({ memories, loaded: true })
  },

  // No optimistic write, unlike the context panel: the id and the date come from the main
  // process, so there is nothing truthful to draw before the answer arrives.
  remember: async draft =>
    await orElse(memoryBridge()?.remember(useAssistantMemory.getState().scope, draft), null),

  /**
   * Reloaded here rather than left to the change event: the panel is what shows the row, and a
   * pinned memory still offering « Pin » is the whole gesture failing in front of the person.
   */
  amend: async (id, patch) => {
    const amended = await amendedIn(useAssistantMemory.getState().scope, id, patch)
    if (amended) await useAssistantMemory.getState().reload()
    return amended
  },

  forget: async id => {
    const forgotten = await orElse(
      memoryBridge()?.forget(useAssistantMemory.getState().scope, id),
      false,
    )
    if (forgotten) await useAssistantMemory.getState().reload()
    return forgotten
  },

  rebuild: async () =>
    await orElse(memoryBridge()?.rebuild(useAssistantMemory.getState().scope), 0),

  reset: async () => {
    await orElse(memoryBridge()?.reset(useAssistantMemory.getState().scope), undefined)
  },

  /** One reload at the end and not one per memory — see `amendedAll`. */
  mergeDuplicates: async () => {
    // Linked BEFORE it is archived, so what was tidied away still says what it stood beside.
    // `linkTo` and not `links`: the union is computed in the store, over what stands there.
    const merged = await amendedAll(
      useAssistantMemory.getState().scope,
      duplicatesIn(useAssistantMemory.getState().memories).flatMap(([keeper, ...rest]) =>
        keeper
          ? rest.map((one): MemoryAmendment => [one.id, { state: 'archived', linkTo: [keeper.id] }])
          : [],
      ),
    )

    await useAssistantMemory.getState().reload()
    return merged
  },

  archiveStale: async now => {
    const archived = await amendedAll(
      useAssistantMemory.getState().scope,
      staleIn(useAssistantMemory.getState().memories, now).map((one): MemoryAmendment => [
        one.id,
        { state: 'archived' },
      ]),
    )

    await useAssistantMemory.getState().reload()
    return archived
  },

  promote: async memory => {
    // Read from the machine's own, never from what is on screen: the panel is showing a project.
    const standing = await orElse(memoryBridge()?.list('global', { limit: MEMORY_PAGE }), [])
    if (alreadySaid(standing, memory)) return true

    /**
     * 🛑 Neither `refs` nor `links` travel: a ref names something INSIDE the project, and
     * `supersededBy` picks what a draft replaces by its first one — a carried ref would have a
     * promoted memory replace another over a path that means nothing there.
     */
    const written = await orElse(
      memoryBridge()?.remember('global', {
        type: memory.type,
        summary: memory.summary,
        importance: memory.importance,
        // The person decided this one follows them, whoever first wrote it down.
        source: { kind: 'person' },
        ...(memory.body === '' ? {} : { body: memory.body }),
      }),
      null,
    )

    return written !== null
  },

  compact: async () =>
    await orElse(memoryBridge()?.compact(useAssistantMemory.getState().scope), 0),

  index: async () => {
    await orElse(memoryBridge()?.index(useAssistantMemory.getState().scope), undefined)
  },

  stopIndex: async () => {
    await orElse(memoryBridge()?.stopIndex(useAssistantMemory.getState().scope), undefined)
    // 🛑 Cleared HERE: an aborted run leaves `sweep`'s loop without a last `onProgress`, so no
    // event ever says it ended — and the panel offered Stop for the rest of the session, with
    // Embed unreachable behind it.
    useAssistantMemory.setState({ indexing: null })
  },
}

export const useAssistantMemory = create<AssistantMemoryState>()(() => assistantMemoryState)

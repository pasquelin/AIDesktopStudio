/**
 * What the assistant has LEARNED about a project — as opposed to `aiMemory.ts`, which is the RAM
 * and VRAM a model would take. Two different things, and the older name was taken first.
 *
 * Read by both sides: the main process composes what travels in a briefing, the window shows the
 * same rows to the person. One module, so what is shown cannot drift from what is sent.
 *
 * 🛑 Not the same mechanism as `projectContext.ts`. A context card is what the PERSON writes about
 * the world of their project and it rides in every generation, which is why it is capped at what a
 * CLIP encoder reads. A memory is what the assistant learned and it only ever reaches a briefing.
 */

export const MEMORY_VERSION = 1

/**
 * What a memory is about. Closed, because the list is what the panel filters on and what a rule
 * picks from — an open string would make both untestable.
 */
export type MemoryType =
  | 'decision'
  | 'architecture'
  | 'feature'
  | 'entity'
  | 'script'
  | 'problem'
  | 'intent'
  | 'convention'

export const MEMORY_TYPES: readonly MemoryType[] = [
  'decision',
  'architecture',
  'feature',
  'entity',
  'script',
  'problem',
  'intent',
  'convention',
]

/**
 * Where a memory stands.
 *
 * `dropped` rather than a deletion: the file is append-only, so forgetting is something written
 * down. It is what compaction later removes, and the only state that leaves no trace.
 */
export type MemoryState = 'live' | 'pinned' | 'archived' | 'dropped'

export const MEMORY_STATES: readonly MemoryState[] = ['live', 'pinned', 'archived', 'dropped']

/**
 * The states a recall may answer with, and what the briefing's memory signal counts.
 *
 * 🛑 In `shared/` because three readers need the SAME predicate: the index that answers, the one
 * that counts, and the bench that stands in for the door. Written a second time in `scripts/banc`
 * it drifted at once — `live` alone there, `live` and `pinned` here, so a decor pinning a memory
 * scored a scenario unwinnable that the shipped studio answers.
 */
export const MEMORY_ANSWERING_STATES: readonly MemoryState[] = ['live', 'pinned']

/** Who put it there. `action` names an action of the registry in `ref`; the others name nothing. */
export type MemorySourceKind = 'action' | 'person' | 'assistant' | 'import'

export const MEMORY_SOURCE_KINDS: readonly MemorySourceKind[] = [
  'action',
  'person',
  'assistant',
  'import',
]

type MemorySource = {
  kind: MemorySourceKind
  /** The action's name for `action`, nothing otherwise. Never a sentence: this is not for a screen. */
  ref?: string
}

/** What of the project a memory is anchored to. `ref` is a path, an id or a uuid — never a name. */
export type MemoryRefKind = 'file' | 'scene' | 'node' | 'asset' | 'document'

export const MEMORY_REF_KINDS: readonly MemoryRefKind[] = [
  'file',
  'scene',
  'node',
  'asset',
  'document',
]

export type MemoryRef = {
  kind: MemoryRefKind
  ref: string
}

export const MEMORY_IMPORTANCE_MIN = 1
export const MEMORY_IMPORTANCE_MAX = 5

/**
 * 🛑 One sentence. Nothing travels in a briefing any more, but the bound is what a listing, a row
 * of the panel and a recall's answer are all sized by — and `rememberOutcome` CUTS to it rather
 * than lose the memory, so raising it would let an interpolated value swallow a whole row.
 */
export const MEMORY_SUMMARY_MAX = 200

/** The half that never travels on its own. Served when an id is asked for, and only then. */
export const MEMORY_BODY_MAX = 2000

/**
 * One memory, as a line of the file holds it.
 *
 * There is deliberately no `scope` field. Which file a line sits in IS its scope, and writing it
 * down a second time is how a line saying `global` ends up in a project's own file.
 */
export type Memory = {
  id: string
  type: MemoryType
  summary: string
  body: string
  importance: number
  createdAt: string
  /**
   * When THIS machine last served it. Absent until it has been of use — that is what ages.
   *
   * 🛑 Held in the index and never written to the file, by ADR-24's own criterion: what one
   * machine's retrieval served says nothing about the project, so it does not travel. A rebuild
   * carries it across rather than reading it back.
   */
  usedAt?: string
  source: MemorySource
  refs: readonly MemoryRef[]
  /** Ids of other memories this one relates to. Not checked here: a link may outlive its target. */
  links: readonly string[]
  state: MemoryState
  /** The id this one replaces. A memory that became false is SUPERSEDED, never overwritten. */
  supersedes?: string
}

/**
 * What a caller hands in to be remembered. The id and the date are minted by the store, which is
 * the only thing that knows what is already there.
 */
export type MemoryDraft = {
  type: MemoryType
  summary: string
  body?: string
  importance: number
  source: MemorySource
  refs?: readonly MemoryRef[]
  links?: readonly string[]
  state?: MemoryState
}

/**
 * Which of the two memories a call is about.
 *
 * A project memory belongs strictly to its project and never leaks into another: what keeps that
 * true is that they are two files behind two stores, not a column anything could filter wrongly.
 */
export type MemoryScope = 'project' | 'global'

export const MEMORY_SCOPES: readonly MemoryScope[] = ['project', 'global']

/**
 * What a caller is looking for. Every field narrows; an empty query is every readable memory.
 *
 * `refs` is what anchors a recall to what is on screen — the open scene, the open script — and it
 * matches on ANY of them, never all: a memory about the scene is wanted whether or not it also
 * mentions the selected node.
 */
export type MemoryQuery = {
  text?: string
  types?: readonly MemoryType[]
  states?: readonly MemoryState[]
  refs?: readonly MemoryRef[]
  limit?: number
}

/** What a listing answers at most when a caller names no limit of its own. */
export const MEMORY_PAGE = 100

/**
 * What may be rewritten of a memory that is already held.
 *
 * The id, when it was made and where it came from are absent on purpose: they are what makes a
 * memory traceable, and a memory whose provenance can be edited proves nothing about itself.
 */
export type MemoryPatch = {
  type?: MemoryType
  summary?: string
  body?: string
  importance?: number
  refs?: readonly MemoryRef[]
  links?: readonly string[]
  state?: MemoryState
  /**
   * Ids to ADD to the links a memory already holds, rather than replace them with.
   *
   * 🛑 A caller that read a memory, appended one id and wrote the list back lost whatever another
   * window — or a merge — had linked in between, without a word. The union is computed inside the
   * store's write queue, where nothing else can be writing.
   */
  linkTo?: readonly string[]
}

/**
 * Why there are no memories when the file says otherwise — same two cases as a project context,
 * and they ask for opposite things: repair the file, or update the studio.
 */
export type MemoryTrouble = 'unreadable' | 'too-new'

/** A memory is live unless it says otherwise. `dropped` is the one state that answers nothing. */
export function isReadable(memory: Memory): boolean {
  return memory.state !== 'dropped'
}

/**
 * How far the embedding of one memory has got. `total` is what was missing when the run started,
 * so a memory written during it does not make the bar go backwards — it makes the next run.
 */
export type MemoryIndexing = {
  scope: MemoryScope
  done: number
  total: number
}

/**
 * What is in front, as anchors — the document's own path and its id.
 *
 * 🛑 `anchored` is the strongest voice of `recallScore` (weight 1, « it is not a guess »), and it
 * answers nothing unless something fills `refs`. Composed here rather than in the window so the
 * shape a recall is anchored by and the shape `MEMORY_WORTH` writes cannot drift apart: a script
 * remembered under `{kind: 'file'}` has to be findable by the same kind.
 */
export function anchorsOf(front: { id: string; path: string } | null): readonly MemoryRef[] {
  if (front === null) return []

  return front.path === ''
    ? [{ kind: 'document', ref: front.id }]
    : [
        { kind: 'file', ref: front.path },
        { kind: 'document', ref: front.id },
      ]
}

/**
 * A question put to the memory, as opposed to a filter laid over it — see `MemoryQuery`.
 *
 * 🛑 The two are not one type because they narrow in opposite directions: every word of a query
 * must match, where a question is answered by whatever comes closest to any of them. The window
 * hands this in; what embeds it and ranks the answers lives in the main process.
 */
export type MemoryRecallAsk = {
  text: string
  /** What is on screen — the open scene, the open script. Ranked first when it matches. */
  refs?: readonly MemoryRef[]
  limit?: number
}

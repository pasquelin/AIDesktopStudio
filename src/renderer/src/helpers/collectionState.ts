/**
 * The state a browsable collection carries, and the pure operations over it. Kept apart from
 * the components so the panels that own this state — and drive a server query from it — can
 * be tested without rendering a virtualized grid.
 */
import { matchesWords, searchWords } from '@shared/text'
import { clamp } from '@shared/numeric'
import { THUMBNAIL_SIZE } from '@shared/domain/project'

type CollectionView = 'grid' | 'list'

export type FacetOption = {
  value: string
  label: string
}

export type FacetDescriptor = {
  key: string
  label: string
  /**
   * Declared by the caller rather than derived from the items: a paginated collection only
   * ever holds the page it is showing, so values read off it would come and go while scrolling.
   */
  options: readonly FacetOption[]
}

export type CollectionState = {
  search: string
  view: CollectionView
  thumbnailSize: number
  sort: string | null
  /** Selected values per facet key; an absent or empty entry means the facet is off. */
  selections: Record<string, readonly string[]>
}

export const MIN_THUMBNAIL = 64
/** The size previews are RENDERED at — zooming past it would draw every tile blurred. */
export const MAX_THUMBNAIL = THUMBNAIL_SIZE
export const THUMBNAIL_STEP = 24

/**
 * Bumped whenever `CollectionState` changes shape, and shared by every store that persists
 * one: a restored state missing a field it now needs lays out a grid of zero-wide columns.
 *
 * 3 for a facet VALUE that stopped existing, which is the same failure read from the other end:
 * `texture` was an asset kind until 2026-08-26, the Materials shelf posed it by default, and a
 * restored `type: ['texture']` narrows to nothing — with no option left in the select to see it
 * by, and none to clear it with. Dropping the blob costs a filter nobody typed twice.
 */
export const COLLECTION_PERSIST_VERSION = 3

export const DEFAULT_COLLECTION_STATE: CollectionState = {
  search: '',
  view: 'grid',
  thumbnailSize: 112,
  sort: null,
  selections: {},
}

/** For panels with no grid and no filters: a fixed state, never persisted. */
export const LIST_ONLY: CollectionState = { ...DEFAULT_COLLECTION_STATE, view: 'list' }

/**
 * The state as it goes to storage. `search` is the one field no store persists: reopening the
 * studio on a catalogue narrowed by a word nobody typed reads as a catalogue gone missing.
 *
 * Here rather than in each `partialize`, because it is a policy of `CollectionState` and not of
 * any one store — two of them persist one, and the rule had drifted into two paraphrases.
 */
export function withoutSearch(state: CollectionState): CollectionState {
  return { ...state, search: '' }
}

export function resizeThumbnails(state: CollectionState, delta: number): CollectionState {
  const thumbnailSize = clamp(state.thumbnailSize + delta, MIN_THUMBNAIL, MAX_THUMBNAIL)
  return thumbnailSize === state.thumbnailSize ? state : { ...state, thumbnailSize }
}

export function selectedValues(state: CollectionState, key: string): readonly string[] {
  return state.selections[key] ?? []
}

/**
 * Sets a facet, or clears it when handed nothing. An emptied facet is dropped rather than
 * held as an empty list, which is what tells a narrowed collection from an untouched one.
 */
export function setFacetValue(
  state: CollectionState,
  key: string,
  value: string | null,
): CollectionState {
  const selections = { ...state.selections }
  if (value) selections[key] = [value]
  else delete selections[key]

  return { ...state, selections }
}

/**
 * Whether anything is narrowing the collection — which is what tells the two empty states apart.
 *
 * `offered` bounds the question to the facets this surface actually shows, and a panel whose
 * facets depend on where it is opened must pass them: a value the bar does not draw cannot be
 * relaxed by the user, so blaming an empty panel on it asks for a filter nobody can find.
 */
export function isFiltered(state: CollectionState, offered?: readonly string[]): boolean {
  if (state.search.trim().length > 0) return true

  return Object.entries(state.selections).some(
    ([key, values]) => values.length > 0 && (offered ? offered.includes(key) : true),
  )
}

export type LocalFilter<T> = {
  /**
   * The text a search matches against, or `null` for an item this side is not the one to judge —
   * one the API has already matched, on fields it holds and this side does not. Weighed again
   * here, such a hit would vanish from the very search that found it.
   */
  text: (item: T) => string | null
  /** Values held by an item, per facet key. A facet with no reader here is left to the caller. */
  facets?: Record<string, (item: T) => readonly string[]>
}

/**
 * Applies the state to items already held in memory. Collections paginated by the API filter
 * server-side instead and never call this — which is why the components themselves filter
 * nothing: only the caller knows where its items come from.
 */
export function filterLocally<T>(
  items: readonly T[],
  state: CollectionState,
  filter: LocalFilter<T>,
): T[] {
  // The same words the project search matches by, and for the same reason: a picture is named
  // after the prompt that made it, so `green sailboat` sits three commas apart in its name.
  const words = searchWords(state.search)

  // Resolved once for the list rather than per item: the shelf that calls this holds a thousand
  // rows now that it pages, and re-entering the facets per row allocated two objects each.
  const narrowing = Object.entries(state.selections).flatMap(([key, values]) => {
    const read = filter.facets?.[key]
    return read && values.length > 0 ? [{ read, wanted: values }] : []
  })

  return items.filter(item => {
    const against = words.length > 0 ? filter.text(item) : null
    if (against !== null && !matchesWords(against, words)) return false

    for (const { read, wanted } of narrowing) {
      const held = read(item)
      if (!wanted.some(value => held.includes(value))) return false
    }

    return true
  })
}

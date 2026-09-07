import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Page } from './page'
import { useAutomaticPulls } from './useAutomaticPulls'
import { useLatest } from './useLatest'
import { usePageQuery } from './usePageQuery'

const NO_PAGE: Page<never> = { items: [], cursor: null }

/**
 * How many pages bringing nothing new are walked before the listing is called finished. A page or
 * two of pure duplicates is ordinary — the listing shifts under the offset — and each one costs a
 * search quota.
 */
const BARREN_MAX = 3

export type PagesOptions = {
  /** A listing nobody is asking for reads nothing at all: every page costs a search quota. */
  enabled?: boolean
  /**
   * Kept for as long as the key lives rather than read again once the cache goes stale — for a
   * listing whose pages are billed and whose freshness nobody is waiting on.
   */
  once?: boolean
  /**
   * Asks on its own while too little is drawn. A surface with no row has no end for a scroll to
   * near, and a page the API narrowed away draws nothing while having a next one behind it.
   */
  fill?: true | { wanted?: number; max?: number }
  /**
   * Whether a run of pages bringing nothing new is the end. True for a listing paged by OFFSET,
   * where repeats mean the walk is going nowhere; FALSE for one that legitimately repeats itself —
   * the model registry walks the private models then the public ones, and an id can be in both.
   */
  endsOnRepeats?: boolean
}

export type Pages<T> = {
  /** Every page read so far, in the order they came, each item once. */
  items: readonly T[]
  /** The very map `items` is built from, so looking one up stays a lookup. */
  byId: ReadonlyMap<string, T>
  /** Nothing more to ask for — the listing ran out, or the API refused. */
  exhausted: boolean
  /**
   * Still waiting on the first page: neither « empty » nor « finished ». False for a listing that
   * is not enabled — nothing is on its way, so nothing is being waited on.
   */
  pending: boolean
  /** A page is on its way, the first one included. */
  fetching: boolean
  /** A page AFTER the first is on its way — what a list says at its foot. */
  fetchingMore: boolean
  /** How many pages have landed. It moves on an answer that brought nothing; nothing else does. */
  pagesRead: number
  /**
   * What the API refused with, or `null`. A refusal and an end look alike on screen and must not
   * be said alike: one is worth trying again, the other is an answer.
   */
  refusal: Error | null
  /** Asks for the next page. Safe to call again before it has answered. */
  more: () => void
  /** Reads it again from its first page — what a refusal is worth offering. */
  retry: () => void
}

/**
 * A listing accumulated page by page, keyed by what it is asking. The paging policy — one page in
 * flight, an id seen once, a listing that stops when its cursor does — is stated here rather than
 * once per panel.
 */
export function usePages<T extends { id: string }>(
  key: readonly unknown[],
  read: (from: { cursor?: string }) => Promise<Page<T>> | undefined,
  { enabled = true, once = false, fill, endsOnRepeats = true }: PagesOptions = {},
): Pages<T> {
  const query = usePageQuery({
    key,
    read,
    enabled,
    once,
    endsOnRepeats,
    noPage: NO_PAGE,
    nextCursor,
  })

  const byId = useMemo(() => onceEach(query.data?.pages), [query.data])
  const items = useMemo(() => [...byId.values()], [byId])

  const state = useLatest(query)
  const asking = useRef(false)
  const more = useCallback(() => {
    if (asking.current || !state.current.hasNextPage || state.current.isFetchingNextPage) return

    asking.current = true
    void state.current.fetchNextPage()
  }, [state])

  useEffect(() => {
    asking.current = query.isFetchingNextPage
  })

  const pending = enabled && query.isPending
  const exhausted = !query.hasNextPage && !pending

  useAutomaticPulls({
    key: JSON.stringify(key),
    drawn: items.length,
    fetching: query.isFetching,
    answered: query.data?.pages.length ?? 0,
    ask: fill && enabled && !exhausted ? more : null,
    ...(fill === true ? { max: BARREN_MAX } : fill),
  })

  return {
    items,
    byId,
    exhausted,
    pending,
    fetching: query.isFetching,
    fetchingMore: query.isFetchingNextPage,
    pagesRead: query.data?.pages.length ?? 0,
    refusal: refusalOf(query.error, query.data?.pages, items.length),
    more,
    retry: useCallback(() => void state.current.refetch(), [state]),
  }
}

// A page that says why and offers nothing is a refusal on screen, as it was when the source threw;
// one that still lists something is a listing, and reads as one.
function refusalOf(
  thrown: Error | null,
  pages: readonly Page<unknown>[] | undefined,
  drawn: number,
): Error | null {
  const last = pages?.at(-1)
  return thrown ?? (drawn === 0 && last?.refused ? new Error(last.refused) : null)
}

/**
 * Where the next page starts, or nothing when there is no next page. Two ways a listing ends
 * without saying so: the offset stops advancing at its ceiling and the API answers the same page
 * for ever, and a run of pages bringing nothing new is the same dead end one step slower.
 */
function nextCursor<T extends { id: string }>(
  page: Page<T>,
  pages: readonly Page<T>[],
  asked: string | undefined,
  endsOnRepeats: boolean,
): string | undefined {
  if (page.cursor === null || page.cursor === asked) return undefined

  return endsOnRepeats && barrenTail(pages) >= BARREN_MAX ? undefined : page.cursor
}

/**
 * How many pages, counting back from the last, brought nothing the ones before them held. One
 * forward walk: react-query asks this on every RENDER of the hook, not only on a fetch.
 */
function barrenTail<T extends { id: string }>(pages: readonly Page<T>[]): number {
  const held = new Set<string>()
  let barren = 0

  for (const [index, page] of pages.entries()) {
    const before = held.size
    for (const item of page.items) held.add(item.id)
    barren = index > 0 && held.size === before ? barren + 1 : 0
  }

  return barren
}

/**
 * The pages by id, minus what a later one repeats: these listings page by OFFSET over something
 * that keeps growing, so an item created between two requests shifts everything down one and the
 * same row comes back — twice on screen, and twice under one React key.
 */
function onceEach<T extends { id: string }>(pages: readonly Page<T>[] | undefined): Map<string, T> {
  const held = new Map<string, T>()

  for (const page of pages ?? []) {
    for (const item of page.items) if (!held.has(item.id)) held.set(item.id, item)
  }

  return held
}

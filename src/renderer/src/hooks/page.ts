import type { ApiFailure } from '@shared/domain/failure'
/**
 * One page of a listing walked by cursor. `cursor` is `null` once there is no page after it.
 *
 * Its own module because both halves of the paging hook need it — the query that reads a page and
 * the hook that accumulates them — and a type re-imported from a parent is what
 * `import-cycles.test.ts` catches.
 */
export type Page<T> = {
  items: readonly T[]
  cursor: string | null
  /** Why part of the listing is missing, when the source answered a page rather than throwing. */
  refused?: ApiFailure
}

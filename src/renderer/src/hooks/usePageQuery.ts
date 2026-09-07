import { useInfiniteQuery } from '@tanstack/react-query'
import type { Page } from './page'

type QueryOptions<T> = {
  key: readonly unknown[]
  read: (from: { cursor?: string }) => Promise<Page<T>> | undefined
  enabled: boolean
  once: boolean
  endsOnRepeats: boolean
  noPage: Page<never>
  nextCursor: (
    page: Page<T>,
    pages: readonly Page<T>[],
    asked: string | undefined,
    endsOnRepeats: boolean,
  ) => string | undefined
}

export function usePageQuery<T extends { id: string }>({
  key,
  read,
  enabled,
  once,
  endsOnRepeats,
  noPage,
  nextCursor,
}: QueryOptions<T>) {
  return useInfiniteQuery<Page<T>>({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      read(typeof pageParam === 'string' ? { cursor: pageParam } : {}) ?? Promise.resolve(noPage),
    getNextPageParam: (page, pages, asked) =>
      nextCursor(page, pages, typeof asked === 'string' ? asked : undefined, endsOnRepeats),
    initialPageParam: undefined,
    enabled,
    ...(once ? { staleTime: Number.POSITIVE_INFINITY } : {}),
  })
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useAccountChange } from '@/hooks/useAccountChange'

export type StudioQueriesProps = { children: ReactNode }

/**
 * The cache the API answers land in, and the one policy every window shares.
 *
 * One client per WINDOW — a cache is memory, and memory never crosses one — but the SAME
 * settings, which is why this is a component rather than a second `new QueryClient` beside each
 * root. The skeleton window asks the registry for its rigging services exactly as the studio
 * does, and mounting no provider at all left it on the error screen.
 */
export function StudioQueries({ children }: StudioQueriesProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  )

  /*
   * Everything cached from the API belongs to the account that was active when it was fetched,
   * and none of the query keys say which. Without this, switching accounts leaves the previous
   * one's models and their signed previews on screen — nothing refetches them, since the keys
   * did not change and `refetchOnWindowFocus` is off.
   */
  useAccountChange(() => client.clear())

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

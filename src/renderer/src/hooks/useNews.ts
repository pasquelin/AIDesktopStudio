import { localizedError } from '@shared/localizedError'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { NewsPage, NewsTopic } from '@shared/domain/news'
import { getBridge } from '@/services/bridge'

/**
 * One topic of the news band. The main process caches per topic for six hours and folds two
 * windows asking at once into one request, so this holds nothing of its own.
 *
 * `retry: false`: the source is somebody else's server and the band is decoration — three
 * silent attempts before a person is told nothing answered is three attempts too many.
 */
export type NewsQuery = ReturnType<typeof useNews>

export function useNews(topic: NewsTopic, enabled: boolean) {
  return useQuery<NewsPage>({
    queryKey: ['news', topic],
    queryFn: () => {
      const bridge = getBridge()
      if (!bridge) throw localizedError('bridgeMissing')

      return bridge.news.read(topic)
    },
    enabled,
    retry: false,
    // The rows of the topic just left stay while the next one is read: emptied first, the band
    // collapses to nothing and the whole page jumps up, then back down a moment later.
    placeholderData: keepPreviousData,
  })
}

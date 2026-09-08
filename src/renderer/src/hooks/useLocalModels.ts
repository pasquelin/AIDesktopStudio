import { useQuery } from '@tanstack/react-query'
import { LOCAL_RUNTIME, type ModelQuery, type ModelSummary } from '@shared/domain/model'
import { getBridge } from '@/services/bridge'

/** Named rather than left to the registry's own default, which is 24 and would truncate in silence. */
const EVERY_LOCAL = 100

/** A stable empty answer, so a surface with nothing to ask hands the same identity to every memo. */
const NO_MODELS: readonly ModelSummary[] = []

/**
 * What this MACHINE holds, off the manifests alone: `runsOn: LOCAL_RUNTIME` closes the walk in the
 * registry before its first request — no cursor, no network.
 */
export function useLocalModels(
  key: readonly unknown[],
  query: ModelQuery,
  enabled: boolean,
): readonly ModelSummary[] {
  const { data } = useQuery<readonly ModelSummary[]>({
    // The narrowing is IN the key: a caller reusing a prefix with a narrower `query` would
    // otherwise be handed the wider ask's cached rows and never issue its own request.
    queryKey: [...key, query, LOCAL_RUNTIME],
    queryFn: async () =>
      (
        await getBridge()?.provider.searchModels({
          ...query,
          runsOn: LOCAL_RUNTIME,
          limit: EVERY_LOCAL,
        })
      )?.items ?? NO_MODELS,
    enabled,
  })

  return data ?? NO_MODELS
}

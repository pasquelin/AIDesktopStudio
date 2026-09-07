import { isRecord } from '@shared/guards'

export function assetIdsFromJobResult(result: unknown): readonly string[] {
  if (!isRecord(result) || !Array.isArray(result['assetIds'])) return []
  return result['assetIds'].filter((value): value is string => typeof value === 'string')
}

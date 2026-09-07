import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { AssetHandlerDeps } from './assetHandlerTypes'
import { registerAssetCloudHandlers } from './assetCloudHandlers'
import { registerAssetMutationHandlers } from './assetMutationHandlers'
import { parseActivityQuery } from './validation'

export type { AssetHandlerDeps } from './assetHandlerTypes'

export function registerAssetHandlers(deps: AssetHandlerDeps): void {
  handle(CHANNELS.activityRead, (_event, query) => deps.journal().read(parseActivityQuery(query)))
  registerAssetMutationHandlers(deps)
  registerAssetCloudHandlers(deps)
}

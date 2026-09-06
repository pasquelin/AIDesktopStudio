import type { Asset } from '@shared/domain/asset'
import type { RemoteAssetCatalog } from '@main/provider/assetCatalog'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { ActivityLog } from '@main/project/activityLog'
import type { AutoCaption, DescribeAssets } from './autoCaption'
import type { CloudBackend } from './cloudBackend'

export type AssetHandlerDeps = {
  catalog: () => AsyncCatalog
  projectPath?: () => string
  remote: () => RemoteAssetCatalog
  cloud: () => CloudBackend
  removeFile: (asset: Asset, expectedProjectPath?: string) => Promise<void>
  renameFile: (asset: Asset, name: string) => Promise<string | undefined>
  activeOwnerId: () => string | null
  journal: () => ActivityLog
  captionArrivals: AutoCaption
  describeAssets: DescribeAssets
}

import { CHANNELS } from '@shared/ipc'
import { animationPosterPathOf } from '@shared/domain/animationLibrary'
import { withoutSourcePath, type Asset } from '@shared/domain/asset'
import { checkAssetName } from '@shared/domain/assetName'
import { handle } from '@main/ipc/handle'
import { log } from '@main/log'
import { describeFailure, persistableFailure, reducedBy } from '@main/provider/client'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { AssetHandlerDeps } from './assetHandlerTypes'
import { parseAlsoRemote, parseAssetChanges, parseAssetIds } from './validation'

const reduced = reducedBy('assets')

async function findMany(catalog: () => AsyncCatalog, ids: readonly string[]): Promise<Asset[]> {
  const found = await Promise.all(ids.map(id => catalog().find(id)))
  return found.filter(asset => asset !== null)
}

async function updateRemoteTags(
  deps: AssetHandlerDeps,
  asset: Asset,
  updated: Asset,
  tags: readonly string[] | undefined,
): Promise<void> {
  if (!asset.remoteAssetId || !tags) return
  const added = tags.filter(tag => !asset.tags.includes(tag))
  const removed = asset.tags.filter(tag => !tags.includes(tag))
  try {
    await deps.remote().updateTags(asset.remoteAssetId, added, removed)
  } catch (error) {
    log.warn('assets', describeFailure(error))
    deps.journal().record({
      level: 'warn',
      topic: 'library',
      messageKey: 'activity.tagsNotSynced',
      params: { name: updated.name },
      detail: persistableFailure(error),
      assetId: asset.id,
    })
  }
}

async function updateAsset(
  deps: AssetHandlerDeps,
  assetId: string,
  changes: unknown,
): Promise<ReturnType<typeof withoutSourcePath>> {
  const parsed = parseAssetChanges(changes)
  const asset = await deps.catalog().find(assetId)
  if (!asset) throw new Error('asset-not-found')
  const name = parsed.name?.trim()
  const refused = name === undefined ? null : checkAssetName(name)
  if (refused) throw new Error(refused)
  const path = name === undefined ? asset.path : await deps.renameFile(asset, name)
  const updated: Asset = {
    ...asset,
    ...(name === undefined ? {} : { name }),
    ...(parsed.tags === undefined ? {} : { tags: [...parsed.tags] }),
    ...(parsed.type === undefined ? {} : { type: parsed.type }),
    ...(parsed.modelMaterialIds === undefined
      ? {}
      : { modelMaterialIds: [...parsed.modelMaterialIds] }),
    ...(path === undefined ? {} : { path }),
    ...posterAfterRename(asset, path),
  }
  const saved = await deps.catalog().add(updated)
  await updateRemoteTags(deps, asset, updated, parsed.tags)
  return withoutSourcePath(saved)
}

/**
 * Where an animation's still sits once its folder has been renamed — it travelled inside that
 * folder without anyone naming it, and the row would otherwise point at a folder that is gone.
 *
 * Recomposed rather than reported, so `animationPosterPathOf` stays the one spelling of it.
 */
function posterAfterRename(asset: Asset, path: string | undefined): Partial<Asset> {
  if (!path || !asset.posterPath || asset.type !== 'animation') return {}
  return { posterPath: animationPosterPathOf(path) ?? asset.posterPath }
}

async function removeAssets(
  deps: AssetHandlerDeps,
  assetIds: unknown,
  alsoRemote: unknown,
  expectedProjectPath?: string,
): Promise<void> {
  if (
    expectedProjectPath !== undefined &&
    (typeof expectedProjectPath !== 'string' || expectedProjectPath !== deps.projectPath?.())
  )
    throw new Error('asset rollback belongs to another project')
  const catalog = deps.catalog()
  const found = await findMany(() => catalog, parseAssetIds(assetIds))
  if (parseAlsoRemote(alsoRemote)) {
    const twins = found.map(asset => asset.remoteAssetId).filter(id => id !== undefined)
    if (twins.length > 0) await reduced(() => deps.remote().deleteMany(twins))
  }
  for (const asset of found) {
    if (expectedProjectPath === undefined) await deps.removeFile(asset)
    else await deps.removeFile(asset, expectedProjectPath)
    await catalog.remove(asset.id)
  }
}

export function registerAssetMutationHandlers(deps: AssetHandlerDeps): void {
  handle(CHANNELS.assetsUpdate, (_event, assetId, changes) => updateAsset(deps, assetId, changes))
  handle(CHANNELS.assetsRemove, (_event, assetIds, alsoRemote, expectedProjectPath) =>
    removeAssets(deps, assetIds, alsoRemote, expectedProjectPath),
  )
  handle(CHANNELS.assetsDescribe, async (_event, assetIds) => {
    const found = await Promise.all(
      parseAssetIds(assetIds).map(assetId => deps.catalog().find(assetId)),
    )
    return deps.describeAssets(found.filter(asset => asset !== null))
  })
}

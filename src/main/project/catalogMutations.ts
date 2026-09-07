import type { Asset } from '@shared/domain/asset'
import type { SqliteStatement, SqlValue } from './sqlite'

type AssetWriters = {
  insertAsset: SqliteStatement
  deleteTags: SqliteStatement
  insertTag: SqliteStatement
}

export function addAsset(asset: Asset, writers: AssetWriters): Asset {
  writers.insertAsset.run(...assetValues(asset))
  writers.deleteTags.run(asset.id)
  for (const tag of asset.tags) writers.insertTag.run(asset.id, tag)
  return asset
}

function assetValues(asset: Asset): SqlValue[] {
  return [
    asset.id,
    asset.name,
    asset.type,
    asset.location,
    asset.path ?? null,
    asset.remoteAssetId ?? null,
    asset.jobId ?? null,
    asset.width ?? null,
    asset.height ?? null,
    asset.bytes ?? null,
    asset.createdAt,
    asset.derivedFrom ?? null,
    asset.sourcePath ?? null,
    asset.hash ?? null,
    asset.probe ? JSON.stringify(asset.probe) : null,
    asset.proxyPath ?? null,
    asset.peaksPath ?? null,
    asset.posterPath ?? null,
    asset.map ?? null,
    asset.mapInverted ? 1 : null,
    asset.packedSlot ?? null,
    ...generationValues(asset),
    ...remoteValues(asset),
  ]
}

function generationValues(asset: Asset): SqlValue[] {
  return [
    asset.generation?.modelId ?? null,
    asset.generation?.modelLabel ?? null,
    asset.generation?.prompt ?? null,
    asset.generation?.seed ?? null,
    asset.generation ? JSON.stringify(asset.generation.params) : null,
  ]
}

function remoteValues(asset: Asset): SqlValue[] {
  return [
    asset.remoteOwnerId ?? null,
    asset.remoteUpdatedAt ?? null,
    asset.remoteSyncedAt ?? null,
    asset.localChangedAt ?? null,
    asset.syncStatus ?? null,
    asset.syncError ?? null,
    asset.groupId ?? null,
    asset.outputIndex ?? null,
    asset.modelTextureUses ? JSON.stringify(asset.modelTextureUses) : null,
    asset.modelMaterialIds ? JSON.stringify(asset.modelMaterialIds) : null,
    asset.convertedFrom ?? null,
    asset.importLosses ? JSON.stringify(asset.importLosses) : null,
  ]
}

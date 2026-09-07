import { orElse } from '@shared/promises'
import type { Asset, AssetGeneration } from '@shared/domain/asset'
import { assetTypeOfRemote, workspaceOfType } from '@shared/domain/assetKind'
import { withAuthoredPrompt } from '@shared/domain/projectContext'
import { generatedAssetName } from '@shared/domain/assetName'
import { channelFromProviderType } from '@shared/domain/material'
import type { WorkspaceId } from '@shared/domain/workspace'
import type { AssetCollector } from '@main/provider/jobManager'
import type { LocalBackend } from './localBackend'
export type RemoteAsset = {
  url: string
  kind: string
  metadataType?: string
  mimeType?: string
  parentId?: string
  ownerId?: string
  updatedAt?: string
  outputIndex?: number
  thumbnailUrl?: string
  generation?: AssetGeneration
}
type HeldAsset = Pick<Asset, 'id' | 'jobId' | 'type'> & {
  onDisk: boolean
}
export type CollectorDeps = {
  retrieve: (remoteAssetId: string) => Promise<RemoteAsset>
  backend: LocalBackend
  newId: () => string
  heldFor: (remoteAssetId: string) => Promise<HeldAsset | null>
}
type Collected = { id: string; workspace: WorkspaceId }
type ImportRequest = Parameters<LocalBackend['importFromUrl']>[0]

function remoteDetails(
  remote: RemoteAsset,
  authored: Parameters<AssetCollector>[2],
  parent: HeldAsset | null,
): Partial<ImportRequest> {
  const source = channelFromProviderType(remote.metadataType)
  return {
    ...(remote.thumbnailUrl ? { thumbnailUrl: remote.thumbnailUrl } : {}),
    ...(remote.ownerId ? { remoteOwnerId: remote.ownerId } : {}),
    ...(remote.updatedAt ? { remoteUpdatedAt: remote.updatedAt } : {}),
    ...(remote.generation
      ? {
          generation: authored
            ? withAuthoredPrompt(remote.generation, authored)
            : remote.generation,
        }
      : {}),
    ...(parent ? { derivedFrom: parent.id } : {}),
    ...(source ? { map: source.channel } : {}),
    ...(source?.inverted ? { mapInverted: true } : {}),
  }
}
export function createAssetCollector({
  retrieve,
  backend,
  newId,
  heldFor,
}: CollectorDeps): AssetCollector {
  const fetchRemote = async (
    remoteAssetId: string,
    mine: HeldAsset | null,
  ): Promise<RemoteAsset | null> => {
    if (!mine) return await retrieve(remoteAssetId)
    return await orElse(retrieve(remoteAssetId), null)
  }
  const importRemote = async (
    job: Parameters<AssetCollector>[0],
    remoteAssetIds: readonly string[],
    index: number,
    remoteAssetId: string,
    remote: RemoteAsset,
    mine: HeldAsset | null,
    authored: Parameters<AssetCollector>[2],
  ): Promise<Collected | null> => {
    const type = assetTypeOfRemote(remote)
    if (!type) return null
    const parent = remote.parentId ? await heldFor(remote.parentId) : null
    const written = authored?.written ?? remote.generation?.prompt
    const asset = await backend.importFromUrl({
      id: mine?.id ?? newId(),
      url: remote.url,
      name: generatedAssetName({
        ...(written ? { prompt: written } : {}),
        label: job.label,
        index,
        total: remoteAssetIds.length,
      }),
      type,
      jobId: job.id,
      remoteAssetId,
      sync: false,
      ...(remoteAssetIds.length > 1 ? { groupId: job.id, outputIndex: index } : {}),
      ...remoteDetails(remote, authored, parent),
    })
    return { id: asset.id, workspace: workspaceOfType(type) }
  }
  const collectOne = async (
    job: Parameters<AssetCollector>[0],
    remoteAssetIds: readonly string[],
    index: number,
    authored: Parameters<AssetCollector>[2],
  ): Promise<Collected | null> => {
    const remoteAssetId = remoteAssetIds[index]
    if (!remoteAssetId) return null
    const held = await heldFor(remoteAssetId)
    const mine = held?.jobId === job.id ? held : null
    if (mine?.onDisk) return { id: mine.id, workspace: workspaceOfType(mine.type) }
    const remote = await fetchRemote(remoteAssetId, mine)
    if (!remote) return mine ? { id: mine.id, workspace: workspaceOfType(mine.type) } : null
    return importRemote(job, remoteAssetIds, index, remoteAssetId, remote, mine, authored)
  }
  return async (job, remoteAssetIds, authored) => {
    const collected: string[] = []
    const shelves = new Set<WorkspaceId>()
    for (const [index] of remoteAssetIds.entries()) {
      const result = await collectOne(job, remoteAssetIds, index, authored)
      if (result) {
        collected.push(result.id)
        shelves.add(result.workspace)
      }
    }
    return { ids: collected, workspaces: [...shelves] }
  }
}

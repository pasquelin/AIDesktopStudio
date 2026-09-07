import { basename, extname } from 'node:path'
import type { Asset, AssetType } from '@shared/domain/asset'
import {
  IMPORTABLE_ASSET_TYPES,
  IMPORTABLE_EXTENSIONS,
  importableAssetTypeOf,
  type ImportableAssetType,
} from '@shared/domain/importFormat'

/** The kinds a file on disk can be linked as. Generated assets cover the rest. */
export type ImportableType = ImportableAssetType

/** The kind of editor a file opens in, read from its extension — or nothing we can montage. */
export function assetTypeOf(path: string): ImportableType | null {
  return importableAssetTypeOf(path)
}

export type LinkOptions = { id: string; type: AssetType; now: string }

/**
 * A row for a file left where it is — empty `path` means « inside », which is why `hash` exists.
 */
export function linkedAsset(source: string, { id, type, now }: LinkOptions): Asset {
  return {
    id,
    name: basename(source, extname(source)),
    type,
    location: 'local',
    sourcePath: source,
    tags: [],
    createdAt: now,
  }
}

export type MediaFilter = { name: string; extensions: string[] }

/** What the open dialog offers, named in the user's language — a native dialog shows them. */
export function mediaFilters(labels: Record<'all' | ImportableType, string>): MediaFilter[] {
  return [
    {
      name: labels.all,
      extensions: IMPORTABLE_ASSET_TYPES.flatMap(type => IMPORTABLE_EXTENSIONS[type]),
    },
    ...IMPORTABLE_ASSET_TYPES.map(type => ({
      name: labels[type],
      extensions: [...IMPORTABLE_EXTENSIONS[type]],
    })),
  ]
}

import { chunk } from '@shared/collections'
import type { FiledAsset } from './catalog'
export type RescanDisk = {
  list: () => Promise<readonly string[]>
  exists: (path: string) => Promise<boolean>
  hash: (path: string) => Promise<string | null>
}
export type RescanCatalog = {
  filed: () => FiledAsset[]
  repath: (from: string, to: string) => void
  markMissing: (assetId: string, at: string | null) => void
}
export type RescanOptions = {
  now: () => string
  stopped: () => boolean
  yieldTo: () => Promise<void>
  onProgress: (progress: RescanProgress) => void
}
export type RescanProgress = {
  done: number
  total: number
}
export type RescanReport = {
  moved: number
  missing: number
  returned: number
  complete: boolean
}
const BATCH = 128

async function fingerprintsOf(
  rows: readonly FiledAsset[],
  onDisk: ReadonlySet<string>,
  wanted: ReadonlySet<string>,
  disk: RescanDisk,
  options: Pick<RescanOptions, 'stopped' | 'yieldTo' | 'onProgress'>,
): Promise<Map<string, string | null>> {
  const claimed = new Set(rows.map(row => row.path))
  const orphans = [...onDisk].filter(path => !claimed.has(path))
  const found = new Map<string, string | null>()
  options.onProgress({ done: 0, total: orphans.length })
  let done = 0
  for (const batch of chunk(orphans, BATCH)) {
    if (options.stopped()) return found
    const hashes = await Promise.all(batch.map(path => disk.hash(path)))
    batch.forEach((path, index) => {
      const hash = hashes[index]
      if (hash && wanted.has(hash)) found.set(hash, found.has(hash) ? null : path)
    })
    done += batch.length
    options.onProgress({ done, total: orphans.length })
    await options.yieldTo()
  }
  return found
}

function markReturned(
  catalog: RescanCatalog,
  rows: readonly FiledAsset[],
  lost: readonly FiledAsset[],
): number {
  const seen = new Set(lost)
  let returned = 0
  for (const row of rows) {
    if (!seen.has(row) && row.missingAt !== null) {
      catalog.markMissing(row.id, null)
      returned += 1
    }
  }
  return returned
}

function reconcileLost(
  catalog: RescanCatalog,
  lost: readonly FiledAsset[],
  byHash: ReadonlyMap<string, string | null>,
  at: string,
): Pick<RescanReport, 'moved' | 'missing'> {
  let moved = 0
  let missing = 0
  const taken = new Set<string>()
  for (const row of lost) {
    const found = row.missingAt === null && row.hash ? byHash.get(row.hash) : null
    if (found && !taken.has(found)) {
      taken.add(found)
      catalog.repath(row.path, found)
      moved += 1
    } else if (row.missingAt === null) {
      catalog.markMissing(row.id, at)
      missing += 1
    }
  }
  return { moved, missing }
}
export async function rescanProject(
  catalog: RescanCatalog,
  disk: RescanDisk,
  { now, stopped, yieldTo, onProgress }: RescanOptions,
): Promise<RescanReport> {
  const onDisk = new Set(await disk.list())
  const rows = catalog.filed()
  const unseen = rows.filter(row => !onDisk.has(row.path))
  const present = await Promise.all(unseen.map(row => disk.exists(row.path)))
  const lost = unseen.filter((_row, index) => present[index] === false)
  const returned = markReturned(catalog, rows, lost)
  const wanted = new Set(
    lost.flatMap(row => (row.missingAt === null && row.hash ? [row.hash] : [])),
  )
  const byHash =
    wanted.size === 0
      ? new Map<string, string | null>()
      : await fingerprintsOf(rows, onDisk, wanted, disk, { stopped, yieldTo, onProgress })
  if (stopped()) return { moved: 0, missing: 0, returned, complete: false }
  const { moved, missing } = reconcileLost(catalog, lost, byHash, now())
  return { moved, missing, returned, complete: true }
}

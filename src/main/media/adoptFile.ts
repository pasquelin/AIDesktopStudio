import type { Stats } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { Asset, MediaProbe } from '@shared/domain/asset'
import { domainFromSignature, SIGNATURE_BYTES } from '@shared/domain/domainFromSignature'
import { filingTypeOf } from '@shared/domain/filingType'
import { stemOf } from '@shared/domain/fileName'
import { isPrivatePath, parentOf } from '@shared/domain/folder'
import type { RoleFolders } from '@shared/domain/folderRole'
import { assetFilePath } from '@main/assets/protocol'
import { isAbsent } from '@main/persistence'
import type { AsyncCatalog } from '@main/project/catalogClient'
import type { ActivityReport } from '@main/project/activityLog'

export type AdoptFileDeps = {
  projectPath: () => string
  catalog: () => AsyncCatalog
  newAssetId: () => string
  now: () => string
  /** The SAME fingerprint the rescan computes — without it the row cannot follow its file. */
  hash: (path: string) => Promise<string | null>
  probeFile: (path: string) => Promise<MediaProbe | null>
  /** The folders that carry a role in this project — a picture under the skyboxes one is a skybox. */
  roles: () => RoleFolders
  /**
   * What every other arrival goes through — the proxy, the waveform and the still. Shared with
   * the download path rather than written again: a file adopted here needs exactly what a
   * generated one needs, and two derivers would drift.
   */
  onAdopted: (asset: Asset) => void
  record: (report: ActivityReport) => void
}

/**
 * Which domain a file in the project belongs to, or nothing when the studio has no editor for
 * it. A suffix the person wrote answers alone — even when it lies, which is what every system
 * does — and the first bytes answer for a name that carries none.
 *
 * A document wears the extension of an open format now, so an `.ora` painted in another
 * application reads as an edit — and refusing it here is what stopped the studio from ever
 * opening one. Nothing is lost by dropping that refusal: a document written as a folder is not a
 * file, and the three other document spellings carry no source domain.
 */
async function domainOf(
  relative: string,
  fileName: string,
  absolute: string,
  roles: RoleFolders,
): Promise<Asset['type'] | null> {
  const folder = parentOf(relative) ?? ''
  if (fileName.includes('.')) return filingTypeOf(fileName, folder, roles)

  const handle = await open(absolute)
  try {
    const head = new Uint8Array(SIGNATURE_BYTES)
    await handle.read(head, 0, SIGNATURE_BYTES, 0)
    return filingTypeOf(fileName, folder, roles, domainFromSignature(head))
  } finally {
    await handle.close()
  }
}

/**
 * Adoptions in flight, by path. The catalogue holds no unique index on `path`, and the row only
 * exists once the fingerprint and the probe have answered — seconds, for a rush. Two double-clicks
 * in that window would otherwise mint two rows over one file, and derive it twice.
 */
const running = new Map<string, Promise<Asset | null>>()

/**
 * Gives a file the project already holds a row in the catalogue, so the studio can open it.
 * Writes `path` where `ingest` writes `sourcePath` — that is what lets the rescan follow the
 * file — and answers `null` for what the studio would not show, which the caller sends outside.
 */
export async function adoptFile(relative: string, deps: AdoptFileDeps): Promise<Asset | null> {
  const already = running.get(relative)
  if (already) return already

  const adopting = adopt(relative, deps).finally(() => running.delete(relative))
  running.set(relative, adopting)
  return adopting
}

async function statOrAbsent(absolute: string): Promise<Stats | null> {
  try {
    return await stat(absolute)
  } catch (error) {
    if (isAbsent(error)) return null

    throw error
  }
}

async function createAdoptedAsset(
  relative: string,
  name: string,
  type: Asset['type'],
  stats: Stats,
  fingerprint: string | null,
  probe: MediaProbe | null,
  deps: AdoptFileDeps,
): Promise<Asset> {
  const at = deps.now()
  const asset = await deps.catalog().add({
    id: deps.newAssetId(),
    name: stemOf(name),
    type,
    location: 'local',
    path: relative,
    bytes: stats.size,
    tags: [],
    createdAt: at,
    localChangedAt: at,
    ...(fingerprint ? { hash: fingerprint } : {}),
    ...(probe ? { probe } : {}),
  })
  deps.record({
    level: 'info',
    topic: 'project',
    messageKey: 'activity.fileAdopted',
    params: { name: asset.name },
  })
  deps.onAdopted(asset)
  return asset
}

async function retargetKnown(known: Asset, relative: string, deps: AdoptFileDeps): Promise<Asset> {
  const roles = deps.roles()
  const type = filingTypeOf(basename(relative), parentOf(relative) ?? '', roles, known.type)
  if (!type || type === known.type) return known
  const updated = await deps.catalog().add({ ...known, type })
  deps.onAdopted(updated)
  return updated
}

async function adopt(relative: string, deps: AdoptFileDeps): Promise<Asset | null> {
  // What the studio keeps for itself is shown, never taken: `.index/` holds the previews and the
  // proxies it rewrites at will, and a row pointing into it would die at the next eviction.
  if (isPrivatePath(relative)) return null

  const known = await deps.catalog().search({ path: relative, limit: 1 })
  if (known[0]) return retargetKnown(known[0], relative, deps)

  const absolute = assetFilePath(deps.projectPath(), relative)
  if (!absolute) return null

  // 🛑 ABSENT answers `null`; anything else still throws. A name a person spoke reaches here —
  // the assistant calls with `voilier vert` — and an ENOENT counted as a studio failure on the
  // status line. A volume that refuses the read is the other case, and swallowing it too would
  // report a catalogue that broke as a file that is not there.
  const stats = await statOrAbsent(absolute)
  if (!stats?.isFile()) return null

  const name = basename(relative)
  const type = await domainOf(relative, name, absolute, deps.roles())
  if (!type) return null

  // Together: ffprobe spawns a process and the fingerprint reads the file, and the tab the user
  // is waiting for is behind both.
  const [probe, fingerprint] = await Promise.all([
    type === 'video' || type === 'audio' ? deps.probeFile(absolute) : null,
    deps.hash(absolute),
  ])
  return await createAdoptedAsset(relative, name, type, stats, fingerprint, probe, deps)
}

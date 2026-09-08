import { localizedError } from '@shared/localizedError'
import { z } from 'zod'
import {
  EXPORT_TARGET_IDS,
  exportTargetOf,
  MAX_EXPORT_WEIGHT,
  type ExportTargetId,
} from '@shared/domain/exportRegistry'
import type { CapabilityDomain } from '@shared/domain/formatCapability'
import type { FolderExportRequest } from '@shared/ipc'
import { pathSegment } from '@main/validation'

/**
 * An export crosses the boundary as bytes and as names this process joins to a path it chose.
 * Both are checked rather than trusted: the renderer is the sandboxed side, and a name carrying
 * a separator is a write outside the folder the user picked.
 */

const isTargetId = (value: unknown): value is ExportTargetId =>
  EXPORT_TARGET_IDS.some(id => id === value)

const written = (id: ExportTargetId): string => exportTargetOf(id).extension

/**
 * Which entry of the registry this is. It used to be a hand-written list of extensions, which
 * answered « some target writes this » and never « THIS target writes this » — so a sky could
 * claim a `.usdz` and be written.
 */
const target = z.custom<ExportTargetId>(isTargetId)

/**
 * One ceiling rather than one per file: the total already bounds every file under it, and the
 * request crosses the boundary by structured clone — so what this bounds is a copy made in each
 * of the two processes. Shared, so a window can refuse BEFORE spending minutes on a mix.
 */
const MAX_EXPORT_BYTES = MAX_EXPORT_WEIGHT

/**
 * A stem set is one file per audible TRACK, and a montage carries as many as somebody laid down —
 * where eight raw channels used to be the widest an export got. The margin above is deliberate.
 */
const MAX_FILES = 64

const file = z.object({
  name: pathSegment,
  extension: z.string(),
  bytes: z.instanceof(Uint8Array),
})

const folderExport = z
  .object({
    folder: pathSegment,
    target,
    files: z.array(file).min(1).max(MAX_FILES),
  })
  .refine(
    value =>
      value.files.reduce((total, entry) => total + entry.bytes.byteLength, 0) <= MAX_EXPORT_BYTES,
  )
  // Checked against the target rather than against every extension the studio writes anywhere:
  // the sandboxed side names the file, and this is what stops one target's name from riding in
  // under another's.
  .refine(value => value.files.every(entry => entry.extension === written(value.target)))

/**
 * `allowed` is the section the CHANNEL stands for, or `null` for the outside door, which serves
 * every one of them. The target alone would not do: it is named by the same sandboxed side that
 * names the file, so nothing would stop one section from asking for another's extension.
 */
export function parseFolderExport(
  value: unknown,
  allowed: CapabilityDomain | null,
): FolderExportRequest {
  const request = folderExport.parse(value)
  if (allowed && exportTargetOf(request.target).domain !== allowed) {
    throw localizedError('exportTargetMismatch', { expected: allowed, actual: request.target })
  }

  return request
}

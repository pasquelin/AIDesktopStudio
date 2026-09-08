import { localizedError } from '@shared/localizedError'
import type { TaskWatch } from '@shared/domain/taskProgress'
import { exportTargetOf, MAX_EXPORT_WEIGHT } from '@shared/domain/exportRegistry'
import { freeName, safeName } from '@shared/domain/otioz'
import type { ExportedFile, FolderExportRequest } from '@shared/ipc'
import { encodeWav } from '@/engines/audio/wav'
import { stemsOf, stemsWeight } from '@/engines/timeline/stems'
import { decodeAsset } from '@/helpers/audioDecode'
import { useDocuments } from '@/stores/documents'
import { documentExportName } from '@/stores/documentExportName'
import { sequenceOf, useSequences } from '@/stores/sequences'

/** What a track is called when it was never renamed — a file cannot be named nothing. */
const UNTITLED_TRACK = 'track'

/**
 * A cut's sound, one `.wav` per audible track.
 *
 * The mix is the window's because the CATALOGUE is: only this side resolves a clip's asset, and
 * only a browser decodes an `.m4a`. What the main process gets is bytes it writes.
 */
export async function montageStemsFiles(
  documentId: string,
  watch?: TaskWatch,
): Promise<FolderExportRequest> {
  const name = documentExportName(useDocuments.getState(), documentId, 'edit')
  const state = sequenceOf(useSequences.getState(), documentId)

  // BEFORE the mix, not after: the writer refuses past this weight, and finding out there means
  // the person waited through every minute of it for a refusal with nothing to act on.
  if (stemsWeight(state) > MAX_EXPORT_WEIGHT) {
    throw localizedError('montageStemsTooLong')
  }

  const stems = await stemsOf(state, decodeAsset, {
    onStep: watch?.onStep,
    signal: watch?.signal,
  })

  if (stems.length === 0) throw localizedError('montageStemsEmpty')

  // Numbered, and the number comes FIRST: two tracks left under the studio's default name are the
  // ordinary case, and a folder holding one `track.wav` is a stem set missing every other row.
  // `safeName` because a track is named by hand — a slash in one would be refused by the writer
  // rather than written, which costs the whole export at the first click.
  const taken = new Set<string>()
  const files: ExportedFile[] = stems.map((stem, row) => {
    const name = freeName(safeName(`${row + 1} ${stem.name.trim() || UNTITLED_TRACK}`), taken)
    taken.add(name)

    return { name, extension: exportTargetOf('montage.wav').extension, bytes: encodeWav(stem.data) }
  })

  return { folder: name, target: 'montage.wav', files }
}

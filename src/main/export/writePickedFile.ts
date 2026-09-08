import { localizedError } from '@shared/localizedError'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { isRecord, readString } from '@shared/guards'

/** `EPERM`, `ENOSPC` and their kin: what went wrong, from an error that also knows where. */
function codeOf(error: unknown): string {
  const code = isRecord(error) ? readString(error, 'code', '') : ''
  return code ? ` (${code})` : ''
}

/**
 * One exported file, written wherever the save dialog lands. Shared by the two exports that
 * produce a single file — a scene, and the montage as a cut.
 *
 * Answers the file NAME, never the path, and `null` when the dialog was dismissed: where a file
 * sits is this process's business, exactly as for an asset.
 */
export async function writePickedFile(
  pick: () => Promise<string | null>,
  data: Uint8Array,
): Promise<string | null> {
  const path = await pick()
  if (!path) return null

  try {
    await writeFile(path, data)
  } catch (error) {
    // The message Node builds carries the absolute path, and a rejected `ipcMain.handle` hands
    // it to the renderer, which files it in the journal. The code says what went wrong without
    // saying where. The cause stays here: Electron rebuilds the rejection from the message alone.
    throw Object.assign(localizedError('fileWriteFailed', { code: codeOf(error) }), {
      cause: error,
    })
  }

  return basename(path)
}

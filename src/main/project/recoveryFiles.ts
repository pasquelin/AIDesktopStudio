import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  RECOVERY_FOLDER,
  RECOVERY_MAX_BYTES,
  type RecoveryDraft,
  type RecoveryEntry,
  type RecoveryWrite,
} from '@shared/domain/recovery'
import { recoveryEntryOf } from './recoveryValidation'
import { byCodeUnit } from '@shared/text'
import { orElse } from '@shared/promises'
import { writeAtomic } from '@main/persistence'

const ENTRY_FILE = 'entry.json'
const CONTENT_FILE = 'content'
const PARTS_FOLDER = 'parts'
const PARTS_INDEX = 'parts.json'

/** Unsaved work, held where a crash cannot take it — see `RECOVERY_FOLDER`. */
export type RecoveryFiles = {
  write: (draft: RecoveryDraft) => Promise<RecoveryWrite>
  list: () => Promise<RecoveryEntry[]>
  read: (documentId: string) => Promise<RecoveryDraft | null>
  /** Drops one entry — what a successful save, and only a confirmed discard, ask for. */
  clear: (documentId: string) => Promise<void>
}

/**
 * A document id on its way to a path segment.
 *
 * The ids the studio mints hold nothing else, but this composes a PATH out of a value that
 * crossed the boundary: one `..` would put the recovery of a project anywhere on the disk.
 */
function safeId(documentId: string): string | null {
  return /^[A-Za-z0-9_-]{1,128}$/.test(documentId) ? documentId : null
}

/**
 * What the recovery of this project weighs, walked ONCE and then kept up to date.
 *
 * Walked per write it was a recursive listing plus a `stat` per file, per dirty document, every
 * thirty seconds — some fourteen hundred syscalls a tick on a project of eight open documents,
 * to decide whether to show one notice against a two-gigabyte ceiling.
 */
async function walkBytes(root: string): Promise<Map<string, number>> {
  const folders = await orElse(readdir(root, { withFileTypes: true }), [])
  const weighed = new Map<string, number>()
  for (const folder of folders) {
    if (!folder.isDirectory()) continue
    const files = await orElse(
      readdir(join(root, folder.name), { recursive: true, withFileTypes: true }),
      [],
    )
    let total = 0
    for (const file of files) {
      if (!file.isFile()) continue
      const measured = await orElse(stat(join(file.parentPath, file.name)), null)
      total += measured?.size ?? 0
    }
    weighed.set(folder.name, total)
  }
  return weighed
}

/** What one entry weighs, from the bytes about to be written rather than from the disk. */
function draftBytes(draft: RecoveryDraft): number {
  const parts = (draft.parts ?? []).reduce((sum, part) => sum + part.png.byteLength, 0)
  return Buffer.byteLength(draft.content, 'utf8') + parts
}

export function createRecoveryFiles(projectPath: () => string): RecoveryFiles {
  const root = (): string => join(projectPath(), RECOVERY_FOLDER)
  /**
   * Per entry, keyed by folder — and by the PROJECT it was walked in. Kept across a project
   * change it still counted the folders of the one being left, and a fresh project could be
   * called full while holding almost nothing.
   */
  let weighed: { of: string; bytes: Map<string, number> } | null = null
  const folderOf = (documentId: string): string | null => {
    const id = safeId(documentId)
    return id === null ? null : join(root(), id)
  }

  return {
    write: async draft => {
      const folder = folderOf(draft.entry.documentId)
      if (folder === null) throw new Error('a recovery entry needs a plain document id')

      // The parts folder goes first: a pass that wrote three surfaces and now writes two must not
      // leave the third behind, where a restore would hand the document a layer it no longer has.
      await rm(join(folder, PARTS_FOLDER), { recursive: true, force: true })
      await mkdir(join(folder, PARTS_FOLDER), { recursive: true })

      const parts = draft.parts ?? []
      for (const [index, part] of parts.entries()) {
        await writeAtomic(join(folder, PARTS_FOLDER, `${index}.png`), part.png)
      }
      await writeAtomic(join(folder, PARTS_INDEX), JSON.stringify(parts.map(part => part.path)))
      await writeAtomic(join(folder, CONTENT_FILE), draft.content)
      // Last, so a crash mid-write leaves an entry that names work already on disk rather than
      // one that names work that never arrived.
      // Through `writeAtomic`, like the three above: this module exists to survive a crash, and a
      // torn `content` would leave an entry naming work that will not parse.
      await writeAtomic(join(folder, ENTRY_FILE), JSON.stringify(draft.entry))

      const here = root()
      if (weighed?.of !== here) weighed = { of: here, bytes: await walkBytes(here) }
      weighed.bytes.set(draft.entry.documentId, draftBytes(draft))
      const used = [...weighed.bytes.values()].reduce((sum, bytes) => sum + bytes, 0)
      return used > RECOVERY_MAX_BYTES ? 'over-budget' : 'written'
    },

    list: async () => {
      const folders = await orElse(readdir(root(), { withFileTypes: true }), [])
      const entries: RecoveryEntry[] = []
      for (const folder of folders) {
        if (!folder.isDirectory()) continue
        const read = await orElse(readFile(join(root(), folder.name, ENTRY_FILE), 'utf8'), null)
        if (read === null) continue
        try {
          const entry = recoveryEntryOf(JSON.parse(read))
          if (entry) entries.push(entry)
        } catch {
          // A half-written entry is one crash away from ordinary: skipped, never thrown, so one
          // damaged folder does not cost the user every other offer in the list.
        }
      }
      // By code unit: these are the studio's own stamps, not text a person reads, and ISO 8601
      // orders that way. Newest first, hence the arguments the other way round.
      return entries.sort((one, other) => byCodeUnit(other.savedAt, one.savedAt))
    },

    read: async documentId => {
      const folder = folderOf(documentId)
      if (folder === null) return null
      // No `exists` before the read: the catch below already answers `null` for an entry that is
      // not there, and the probe was a syscall whose answer was thrown away.
      try {
        const entry = recoveryEntryOf(JSON.parse(await readFile(join(folder, ENTRY_FILE), 'utf8')))
        if (!entry) return null
        const content = await readFile(join(folder, CONTENT_FILE), 'utf8')
        const paths: unknown = JSON.parse(await readFile(join(folder, PARTS_INDEX), 'utf8'))
        if (!Array.isArray(paths)) return { entry, content }
        const parts = []
        for (const [index, path] of paths.entries()) {
          if (typeof path !== 'string') continue
          parts.push({
            path,
            png: new Uint8Array(await readFile(join(folder, PARTS_FOLDER, `${index}.png`))),
          })
        }
        return { entry, content, ...(parts.length > 0 ? { parts } : {}) }
      } catch {
        return null
      }
    },

    clear: async documentId => {
      const folder = folderOf(documentId)
      if (folder === null) return
      await rm(folder, { recursive: true, force: true })
      weighed?.bytes.delete(documentId)
    },
  }
}

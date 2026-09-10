import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  RECOVERY_FOLDER,
  RECOVERY_MAX_BYTES,
  type RecoveryDraft,
  type RecoveryEntry,
  type RecoveryWrite,
} from '@shared/domain/recovery'
import { isDocumentKind } from '@shared/domain/document'
import { isWorkspaceId } from '@shared/domain/workspace'
import { isRecord } from '@shared/guards'
import { isReadFidelity } from '@shared/domain/readFidelity'
import { orElse } from '@shared/promises'
import { exists } from '@main/persistence'

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

function entryOf(value: unknown): RecoveryEntry | null {
  if (!isRecord(value)) return null
  const { kind, title, workspace, path, savedAt } = value
  const documentId = typeof value.documentId === 'string' ? safeId(value.documentId) : null
  if (documentId === null) return null
  if (!isDocumentKind(kind) || typeof workspace !== 'string' || !isWorkspaceId(workspace)) {
    return null
  }
  if (typeof title !== 'string' || typeof path !== 'string' || typeof savedAt !== 'string') {
    return null
  }
  return {
    documentId,
    kind,
    title,
    workspace,
    path,
    savedAt,
    ...(typeof value.sourceAssetId === 'string' ? { sourceAssetId: value.sourceAssetId } : {}),
    ...(isReadFidelity(value.sourceFidelity) ? { sourceFidelity: value.sourceFidelity } : {}),
  }
}

/** What the recovery of this project weighs, summed over its entries rather than walked deep. */
async function usedBytes(root: string): Promise<number> {
  const folders = await orElse(readdir(root, { withFileTypes: true }), [])
  let total = 0
  for (const folder of folders) {
    if (!folder.isDirectory()) continue
    const files = await orElse(readdir(join(root, folder.name), { recursive: true }), [])
    for (const file of files) {
      const measured = await orElse(stat(join(root, folder.name, String(file))), null)
      if (measured?.isFile()) total += measured.size
    }
  }
  return total
}

export function createRecoveryFiles(projectPath: () => string): RecoveryFiles {
  const root = (): string => join(projectPath(), RECOVERY_FOLDER)
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
        await writeFile(join(folder, PARTS_FOLDER, `${index}.png`), part.png)
      }
      await writeFile(
        join(folder, PARTS_INDEX),
        JSON.stringify(parts.map(part => part.path)),
        'utf8',
      )
      await writeFile(join(folder, CONTENT_FILE), draft.content, 'utf8')
      // Last, so a crash mid-write leaves an entry that names work already on disk rather than
      // one that names work that never arrived.
      await writeFile(join(folder, ENTRY_FILE), JSON.stringify(draft.entry), 'utf8')

      return (await usedBytes(root())) > RECOVERY_MAX_BYTES ? 'over-budget' : 'written'
    },

    list: async () => {
      const folders = await orElse(readdir(root(), { withFileTypes: true }), [])
      const entries: RecoveryEntry[] = []
      for (const folder of folders) {
        if (!folder.isDirectory()) continue
        const read = await orElse(readFile(join(root(), folder.name, ENTRY_FILE), 'utf8'), null)
        if (read === null) continue
        try {
          const entry = entryOf(JSON.parse(read))
          if (entry) entries.push(entry)
        } catch {
          // A half-written entry is one crash away from ordinary: skipped, never thrown, so one
          // damaged folder does not cost the user every other offer in the list.
        }
      }
      // ISO 8601 sorts by code point, and these are the studio's own stamps rather than text a
      // person typed: a collator would be a language brought to bear on a machine format.
      return entries.sort((one, other) => (one.savedAt < other.savedAt ? 1 : -1))
    },

    read: async documentId => {
      const folder = folderOf(documentId)
      if (folder === null || !exists(join(folder, ENTRY_FILE))) return null
      try {
        const entry = entryOf(JSON.parse(await readFile(join(folder, ENTRY_FILE), 'utf8')))
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
      if (folder !== null) await rm(folder, { recursive: true, force: true })
    },
  }
}

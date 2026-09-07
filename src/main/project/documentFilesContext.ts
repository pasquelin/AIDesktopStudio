import { randomUUID } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import {
  STAGING_SUFFIX,
  documentExtensionOf,
  documentPath,
  type DocumentFile,
  type DocumentKind,
} from '@shared/domain/document'
import { type NamedDocument } from '@shared/domain/documentName'
import { isMissing, writeAtomic } from '@main/persistence'
import { bodyFormatOf } from './documentBody'
import { createHeadCache } from './headCache'
import { headOf, type DocumentFilesDeps } from './documentFilesShared'

export class DocumentFilesContext {
  readonly pending = new Map<string, Promise<unknown>>()
  readonly index = new Map<string, string>()
  readonly seen = new Map<string, number>()
  readonly heads = createHeadCache(headOf)
  readonly staging = new Set<string>()

  constructor(private readonly deps: DocumentFilesDeps) {}

  readonly keyOf = (id: string, kind: DocumentKind): string => `${kind}:${id}`
  readonly relativeOf = (file: string): string =>
    relative(this.deps.projectPath(), file).split(sep).join('/')
  readonly absoluteOf = (path: string): string => join(this.deps.projectPath(), path)
  readonly fileOf = (id: string, kind: DocumentKind): string =>
    join(this.deps.projectPath(), documentPath(id, kind))

  readonly namesIn = async (folder: string): Promise<NamedDocument[]> =>
    ((await this.deps.folderNames(folder)) ?? []).map(entry => {
      const fileName = entry.normalize('NFC')
      return { id: fileName, fileName }
    })

  readonly timeOf = async (file: string): Promise<number | null> => {
    try {
      return (await stat(file)).mtimeMs
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }
  }

  readonly remember = async (file: string): Promise<void> => {
    const time = await this.timeOf(file)
    if (time !== null) this.seen.set(file, time)
  }

  readonly queued = <T>(id: string, run: () => Promise<T>): Promise<T> => {
    const next = this.settled(this.pending.get(id), run)
    this.pending.set(id, this.ignoreFailure(next))
    return next
  }

  private async settled<T>(
    pending: Promise<unknown> | undefined,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      await pending
    } catch {
      // A failed prior operation does not block this document for the session.
    }
    return await run()
  }

  private async ignoreFailure(pending: Promise<unknown>): Promise<void> {
    try {
      await pending
    } catch {
      // The next queued operation receives its own result; this tail only serialises work.
    }
  }

  readonly store = async (file: string, document: DocumentFile): Promise<void> => {
    const copy = `${file}.${randomUUID()}${STAGING_SUFFIX}`
    this.staging.add(basename(copy))
    await mkdir(dirname(file), { recursive: true })
    try {
      const body = bodyFormatOf(documentExtensionOf(basename(file))).write(document)
      await writeAtomic(file, body, { staging: copy })
      this.heads.forget(file)
    } finally {
      this.staging.delete(basename(copy))
    }
  }

  readonly sweep = async (orphans: readonly string[]): Promise<void> => {
    await Promise.all(
      orphans.map(orphan => rm(this.absoluteOf(orphan), { force: true, recursive: true })),
    )
  }
}

import { rm, rename } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  documentExtensionOf,
  type DocumentDescriptor,
  type DocumentFile,
  type DocumentKind,
} from '@shared/domain/document'
import {
  checkDocumentName,
  documentFileName,
  type NamedDocument,
} from '@shared/domain/documentName'
import { foldForFileName } from '@shared/domain/fileName'
import { parentOf } from '@shared/domain/folder'
import { exists } from '@main/persistence'
import type { HeadCache } from './headCache'
import { DOCUMENT_DUPLICATE_NAME, type FoundDocument } from './documentFilesShared'

export type RenameDeps = {
  locate: (id: string, kind: DocumentKind) => Promise<{ file: string; found: FoundDocument | null }>
  relativeOf: (file: string) => string
  namesIn: (folder: string) => Promise<NamedDocument[]>
  absoluteOf: (path: string) => string
  bodyAt: (file: string, kind: DocumentKind, id: string) => Promise<DocumentFile | null>
  store: (file: string, document: DocumentFile) => Promise<void>
  heads: HeadCache
  index: Map<string, string>
  keyOf: (id: string, kind: DocumentKind) => string
  remember: (file: string) => Promise<void>
  seen: Map<string, number>
}

type RenamePlan = {
  from: string
  to: string
  path: string
  entry: string
  descriptor: DocumentDescriptor
  held: DocumentFile | null
}

export async function renameDocument(
  deps: RenameDeps,
  id: string,
  kind: DocumentKind,
  title: string,
): Promise<DocumentDescriptor> {
  const plan = await renamePlan(deps, id, kind, title)
  if (plan.to === plan.from) return { ...plan.descriptor, title, path: plan.path }
  if (!plan.held) throw new Error(`Document ${id} is not there to rename`)
  await moveRenamed(deps, plan, plan.held, title, id)
  deps.heads.forget(plan.from)
  deps.heads.forget(plan.to)
  deps.index.set(deps.keyOf(id, kind), plan.path)
  await deps.remember(plan.to)
  deps.seen.delete(plan.from)
  return { ...plan.descriptor, title, path: plan.path }
}

async function renamePlan(
  deps: RenameDeps,
  id: string,
  kind: DocumentKind,
  title: string,
): Promise<RenamePlan> {
  const { file: from, found } = await deps.locate(id, kind)
  const inFolder = parentOf(deps.relativeOf(from)) ?? ''
  const refused = checkDocumentName(
    title,
    kind,
    await deps.namesIn(inFolder),
    basename(from).normalize('NFC'),
  )
  if (refused) throw new Error(refused)
  const entry = documentFileName(title, kind)
  const path = inFolder === '' ? entry : `${inFolder}/${entry}`
  const to = deps.absoluteOf(path)
  if (!found) throw new Error(`Document ${id} is not there to rename`)
  const descriptor = { ...found.descriptor, id }
  if (to === from) return { from, to, path, entry, descriptor, held: null }
  const sameFile = foldForFileName(entry) === foldForFileName(basename(from))
  if (!sameFile && (await exists(to))) throw new Error(DOCUMENT_DUPLICATE_NAME)
  const held = found.body ?? (await deps.bodyAt(from, kind, id))
  if (!held) throw new Error(`Document ${id} is not there to rename`)
  return { from, to, path, entry, descriptor, held }
}

async function moveRenamed(
  deps: RenameDeps,
  plan: RenamePlan,
  held: DocumentFile,
  title: string,
  id: string,
): Promise<void> {
  const document: DocumentFile = { ...held, title, id }
  if (documentExtensionOf(basename(plan.from)) !== documentExtensionOf(plan.entry)) {
    await deps.store(plan.to, document)
    await rm(plan.from, { force: true })
    return
  }
  await deps.store(plan.from, document)
  await rename(plan.from, plan.to)
}

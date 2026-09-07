import { documentExtensionOf, documentStemOf } from '@shared/domain/document'
import type { PathChange, Refusal } from '@shared/domain/fileOp'
import { foldForFileName, stemForSuffix } from '@shared/domain/fileName'
import { isPrivatePath, moveRefusal, nameOf, parentOf, pathIn } from '@shared/domain/folder'
export type FileAct =
  | {
      act: 'move'
      from: string
      to: string
    }
  | {
      act: 'copy'
      from: string
      to: string
    }
  | {
      act: 'createFolder'
      to: string
    }
  | {
      act: 'trash'
      from: string
    }
export type FileRequest =
  | {
      op: 'rename'
      path: string
      name: string
    }
  | {
      op: 'move'
      paths: readonly string[]
      folder: string
    }
  | {
      op: 'duplicate'
      paths: readonly string[]
      folder: string | null
    }
  | {
      op: 'createFolder'
      folder: string
      name: string
    }
  | {
      op: 'trash'
      paths: readonly string[]
    }
export type FolderSnapshot = ReadonlyMap<string, readonly string[]>
export type FilePlan = {
  acts: readonly FileAct[]
  refused: readonly Refusal[]
}
export function changeOf(act: FileAct): PathChange {
  if (act.act === 'move') return { from: act.from, to: act.to }
  if (act.act === 'trash') return { from: act.from, to: '' }
  return { from: '', to: act.to }
}
export function inverseOf(change: PathChange): FileAct | null {
  if (change.from && change.to) return { act: 'move', from: change.to, to: change.from }
  if (change.to) return { act: 'trash', from: change.to }
  return null
}
export function foldersFor(request: FileRequest): readonly string[] {
  if (request.op === 'rename') return [parentOf(request.path) ?? '']
  if (request.op === 'createFolder') return [request.folder]
  const parents = request.paths.map(path => parentOf(path) ?? '')
  if (request.op === 'trash') return parents
  return request.folder === null ? parents : [...parents, request.folder]
}
function present(folders: FolderSnapshot, path: string): boolean {
  const parent = parentOf(path)
  const entries = folders.get(parent ?? '')
  return entries !== undefined && entries.some(entry => entry === nameOf(path))
}
export function freeName(taken: ReadonlySet<string>, fileName: string): string {
  const held = (candidate: string): boolean => taken.has(foldForFileName(candidate))
  if (!held(fileName)) return fileName
  const extension = documentExtensionOf(fileName)
  const stem = stemForSuffix(documentStemOf(fileName))
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}${extension}`
    if (!held(candidate)) return candidate
  }
}
function foldedNames(folders: FolderSnapshot, folder: string): Set<string> {
  return new Set((folders.get(folder) ?? []).map(foldForFileName))
}

function planFolder(
  request: Extract<FileRequest, { op: 'createFolder' }>,
  folders: FolderSnapshot,
): FilePlan {
  const own = isPrivatePath(request.folder)
  if (own || !folders.has(request.folder))
    return { acts: [], refused: [{ path: request.folder, reason: own ? 'private' : 'missing' }] }
  const target = request.folder === '' ? request.name : `${request.folder}/${request.name}`
  return foldedNames(folders, request.folder).has(foldForFileName(request.name))
    ? { acts: [], refused: [{ path: target, reason: 'exists' }] }
    : { acts: [{ act: 'createFolder', to: target }], refused: [] }
}

function planRename(
  request: Extract<FileRequest, { op: 'rename' }>,
  folders: FolderSnapshot,
): FilePlan {
  const { path, name } = request
  if (isPrivatePath(path)) return { acts: [], refused: [{ path, reason: 'private' }] }
  if (!present(folders, path)) return { acts: [], refused: [{ path, reason: 'missing' }] }
  const parent = parentOf(path) ?? ''
  const target = pathIn(parent, name)
  const taken = foldedNames(folders, parent)
  taken.delete(foldForFileName(nameOf(path)))
  if (taken.has(foldForFileName(name)))
    return { acts: [], refused: [{ path: target, reason: 'exists' }] }
  return { acts: target === path ? [] : [{ act: 'move', from: path, to: target }], refused: [] }
}

function planTrash(
  request: Extract<FileRequest, { op: 'trash' }>,
  folders: FolderSnapshot,
): FilePlan {
  const acts: FileAct[] = []
  const refused: Refusal[] = []
  for (const path of request.paths) {
    if (isPrivatePath(path, 'shown')) refused.push({ path, reason: 'private' })
    else if (!present(folders, path)) refused.push({ path, reason: 'missing' })
    else acts.push({ act: 'trash', from: path })
  }
  return { acts, refused }
}

function transferOf(
  path: string,
  folder: string,
  moving: boolean,
  folders: FolderSnapshot,
  namesIn: (folder: string) => Set<string>,
): FileAct | Refusal | null {
  if (!present(folders, path)) return { path, reason: 'missing' }
  const refusal = moveRefusal(path, folder)
  if (refusal) return { path, reason: refusal }
  const held = namesIn(folder)
  const name = nameOf(path)
  if (!moving) {
    const free = freeName(held, name)
    held.add(foldForFileName(free))
    return { act: 'copy', from: path, to: folder === '' ? free : `${folder}/${free}` }
  }
  if (folder === (parentOf(path) ?? '')) return null
  if (held.has(foldForFileName(name))) return { path, reason: 'exists' }
  held.add(foldForFileName(name))
  return { act: 'move', from: path, to: pathIn(folder, name) }
}

export function planFiles(request: FileRequest, folders: FolderSnapshot): FilePlan {
  if (request.op === 'createFolder') return planFolder(request, folders)
  if (request.op === 'rename') return planRename(request, folders)
  if (request.op === 'trash') return planTrash(request, folders)
  return planTransfer(request, folders)
}

function planTransfer(
  request: Extract<FileRequest, { op: 'move' | 'duplicate' }>,
  folders: FolderSnapshot,
): FilePlan {
  const acts: FileAct[] = []
  const refused: Refusal[] = []
  const moving = request.op === 'move'
  const into = request.folder
  if (into !== null) {
    const own = isPrivatePath(into)
    if (own || !folders.has(into)) {
      for (const path of request.paths) refused.push({ path, reason: own ? 'private' : 'missing' })
      return { acts, refused }
    }
  }
  const claimed = new Map<string, Set<string>>()
  const namesIn = (folder: string): Set<string> => {
    const held = claimed.get(folder) ?? foldedNames(folders, folder)
    claimed.set(folder, held)
    return held
  }
  for (const path of request.paths) {
    const folder = into ?? parentOf(path) ?? ''
    const planned = transferOf(path, folder, moving, folders, namesIn)
    if (!planned) continue
    if ('act' in planned) acts.push(planned)
    else refused.push(planned)
  }
  return { acts, refused }
}
export async function folderSnapshot(
  names: (folder: string) => Promise<readonly string[] | null>,
  folders: readonly string[],
): Promise<FolderSnapshot> {
  const unique = [...new Set(folders)]
  const read = await Promise.all(unique.map(one => names(one)))
  const known = new Map<string, readonly string[]>()
  for (const [at, entries] of read.entries()) {
    const path = unique[at]
    if (path !== undefined && entries !== null) known.set(path, entries)
  }
  return known
}

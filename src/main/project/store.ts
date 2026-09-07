import { orElse } from '@shared/promises'
import type { Dir } from 'node:fs'
import { mkdir, opendir, readFile, rename as renameFolder, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  CATALOG_FILE,
  MANIFEST_FILE,
  MANIFEST_VERSION,
  LEGACY_MANIFEST_FILE,
  MACHINE_FOLDERS,
  type Manifest,
  type Project,
  type ProjectOpenFailure,
  type ProjectRenameFailure,
} from '@shared/domain/project'
import type { ActivityMessageKey } from '@shared/domain/activity'
import { isHiddenEntry } from '@shared/domain/folder'
import { isSafeFileName } from '@shared/domain/fileName'
import type { FolderRole, RoleFolders } from '@shared/domain/folderRole'
import { isRecord } from '@shared/guards'
import { log } from '@main/log'
import { exists, isMissing, writeAtomic, writeQueue } from '@main/persistence'
import { CATALOGUE_CLOSED, type AsyncCatalog } from './catalogClient'
import { applyJournal } from './fileJournal'
import { ensureRoleFolder, layRoleFolders, resolveRoleFolders, writeRoleCache } from './folderRoles'
import { hideFromExplorer } from './hideFromExplorer'
import { parseManifest } from './validation'
export class NoProjectError extends Error {
  constructor() {
    super('no-project')
    this.name = 'NoProjectError'
  }
}
export function isCatalogueGone(error: unknown): boolean {
  if (error instanceof NoProjectError) return true
  return error instanceof Error && error.message === CATALOGUE_CLOSED
}
export async function orWhenGone<T>(read: () => Promise<T>, gone: T): Promise<T> {
  try {
    return await read()
  } catch (error: unknown) {
    if (isCatalogueGone(error)) return gone
    throw error
  }
}
const NO_PROJECT_THERE: readonly ProjectOpenFailure[] = [
  'not-a-project',
  'nested',
  'holds-projects',
]
export async function holdsAProject(store: ProjectStore, path: string): Promise<boolean> {
  try {
    return (await store.inspect(path)) === 'project'
  } catch (error) {
    return error instanceof ProjectOpenError && !NO_PROJECT_THERE.includes(error.reason)
  }
}
export class ProjectOpenError extends Error {
  constructor(
    readonly reason: ProjectOpenFailure,
    cause?: unknown,
  ) {
    super(reason, { cause })
    this.name = 'ProjectOpenError'
  }
}
export class ProjectRenameError extends Error {
  constructor(readonly reason: ProjectRenameFailure) {
    super(reason)
    this.name = 'ProjectRenameError'
  }
}
const RENAME_FAILURE_KEYS: Record<ProjectRenameFailure, ActivityMessageKey> = {
  'unsafe-name': 'activity.projectNameUnsafe',
  taken: 'activity.projectNameTaken',
}
const OPEN_FAILURE_KEYS: Record<ProjectOpenFailure, ActivityMessageKey> = {
  'not-a-project': 'activity.projectNotAProject',
  unreadable: 'activity.projectUnreadable',
  'too-new': 'activity.projectTooNew',
  nested: 'activity.projectNested',
  'holds-projects': 'activity.projectHoldsProjects',
}
export function openFailureKey(error: unknown): ActivityMessageKey | null {
  if (error instanceof ProjectRenameError) return RENAME_FAILURE_KEYS[error.reason]
  return error instanceof ProjectOpenError ? OPEN_FAILURE_KEYS[error.reason] : null
}
export type ProjectStoreDeps = {
  openCatalog: (file: string) => Promise<AsyncCatalog>
  now: () => string
  onChange: (project: Project | null) => void
  onRoles: (roles: RoleFolders) => void
  settle?: () => Promise<void>
}
export type FolderVerdict = 'project' | 'occupied' | 'blank'
export type ProjectStore = {
  create: (path: string) => Promise<Project>
  inspect: (path: string) => Promise<FolderVerdict>
  open: (path: string) => Promise<Project>
  rename: (path: string, name: string) => Promise<Project>
  current: () => Project | null
  path: () => string
  catalog: () => AsyncCatalog
  roles: () => RoleFolders
  folderFor: (role: FolderRole) => Promise<string>
  touch: () => void
  settled: () => Promise<void>
  duringWrite: <T>(write: (root: string, catalog: AsyncCatalog) => Promise<T>) => Promise<T>
  close: () => Promise<void>
}
async function writeManifest({ path, manifest }: Project): Promise<void> {
  await writeAtomic(join(path, MANIFEST_FILE), JSON.stringify(manifest, null, 2))
}
async function ensureMachineFolders(root: string): Promise<void> {
  await Promise.all(MACHINE_FOLDERS.map(folder => mkdir(join(root, folder), { recursive: true })))
  await hideFromExplorer(join(root, '.index'))
}
function ancestorsOf(path: string): string[] {
  const found: string[] = []
  for (let child = path, parent = dirname(child); parent !== child; parent = dirname(child)) {
    found.push(parent)
    child = parent
  }
  return found
}
const hasManifest = (folder: string): Promise<boolean> => exists(join(folder, MANIFEST_FILE))
type FolderSurvey = {
  visible: boolean
  children: string[]
}
async function surveyFolder(folder: string): Promise<FolderSurvey> {
  let dir: Dir
  try {
    dir = await opendir(folder)
  } catch (error) {
    if (isMissing(error)) return { visible: false, children: [] }
    throw error
  }
  const survey: FolderSurvey = { visible: false, children: [] }
  try {
    for await (const entry of dir) {
      if (isHiddenEntry(entry.name)) continue
      survey.visible = true
      if (entry.isDirectory()) survey.children.push(join(folder, entry.name))
    }
  } finally {
    await orElse(dir.close(), undefined)
  }
  return survey
}
type ManifestSource = {
  body: string
  legacy: boolean
}
async function sameFolder(one: string, other: string): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([stat(one), stat(other)])
    return first.ino === second.ino && first.dev === second.dev
  } catch {
    return false
  }
}
async function readManifest(path: string): Promise<ManifestSource> {
  try {
    return { body: await readFile(join(path, MANIFEST_FILE), 'utf8'), legacy: false }
  } catch (error) {
    if (!isMissing(error)) throw error
    return { body: await readFile(join(path, LEGACY_MANIFEST_FILE), 'utf8'), legacy: true }
  }
}
async function promoteManifest(path: string, body: string): Promise<void> {
  await orElse(writeAtomic(join(path, MANIFEST_FILE), body), undefined)
  await hideFromExplorer(join(path, MANIFEST_FILE))
}
async function loadManifest(path: string): Promise<Manifest> {
  let source: ManifestSource
  try {
    source = await readManifest(path)
  } catch (error) {
    throw new ProjectOpenError(isMissing(error) ? 'not-a-project' : 'unreadable', error)
  }
  let head: unknown
  try {
    head = JSON.parse(source.body)
  } catch (error) {
    throw new ProjectOpenError('unreadable', error)
  }
  if (isRecord(head) && Number.isInteger(head.version) && Number(head.version) > MANIFEST_VERSION) {
    throw new ProjectOpenError('too-new')
  }
  let manifest: Manifest
  try {
    manifest = parseManifest(head)
  } catch (error) {
    throw new ProjectOpenError('unreadable', error)
  }
  if (source.legacy) await promoteManifest(path, source.body)
  return manifest
}
export function createProjectStore({
  openCatalog,
  now,
  onChange,
  onRoles,
  settle,
}: ProjectStoreDeps): ProjectStore {
  let project: Project | null = null
  let catalog: AsyncCatalog | null = null
  let roleFolders: RoleFolders = {}
  const writes = writeQueue()
  const close = (): void => {
    void catalog?.close().catch((error: unknown) => {
      log.warn('project', `closing the catalogue failed: ${String(error)}`)
    })
    catalog = null
    project = null
  }
  const holding = (renamed: Project): Project => {
    project = renamed
    return renamed
  }
  const movedFolder = async (path: string, folder: string): Promise<string> => {
    if (folder === path) return path
    if ((await exists(folder)) && !(await sameFolder(path, folder))) {
      throw new ProjectRenameError('taken')
    }
    await renameFolder(path, folder)
    return folder
  }
  const activate = async (opened: Project): Promise<Project> => {
    const file = join(opened.path, CATALOG_FILE)
    await mkdir(dirname(file), { recursive: true })
    const resolving = readRoles(opened.path)
    const opening = await openCatalog(file)
    try {
      const caught = await applyJournal(opened.path, opening)
      if (caught > 0) log.info('project', `finished ${caught} move(s) left by a previous session`)
    } catch (error) {
      log.warn('project', `replaying the move journal failed: ${String(error)}`)
    }
    const resolved = await resolving
    await Promise.all([settle?.(), writes.settled()])
    close()
    catalog = opening
    project = opened
    roleFolders = resolved
    onChange(opened)
    onRoles(resolved)
    return opened
  }
  const roleFolderMissing = async (
    root: string,
    held: RoleFolders,
    role: FolderRole,
  ): Promise<boolean> => {
    const folder = held[role]
    return folder !== undefined && !(await exists(join(root, folder)))
  }
  const readRoles = async (root: string): Promise<RoleFolders> => {
    try {
      const { roles, walked } = await resolveRoleFolders(root)
      if (walked) await writeRoleCache(root, roles)
      return roles
    } catch (error) {
      log.warn('project', `reading the folder roles failed: ${String(error)}`)
      return {}
    }
  }
  return {
    create: async path => {
      await ensureMachineFolders(path)
      await layRoleFolders(path)
      const timestamp = now()
      const made: Project = {
        path,
        manifest: {
          version: MANIFEST_VERSION,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }
      await writeManifest(made)
      await hideFromExplorer(join(path, MANIFEST_FILE))
      return await activate(made)
    },
    inspect: async path => {
      try {
        await loadManifest(path)
        return 'project'
      } catch (error) {
        const missing = error instanceof ProjectOpenError && error.reason === 'not-a-project'
        if (!missing) throw error
      }
      const above = await Promise.all(ancestorsOf(path).map(hasManifest))
      if (above.includes(true)) throw new ProjectOpenError('nested')
      const { visible, children } = await surveyFolder(path)
      const inside = await Promise.all(children.map(hasManifest))
      if (inside.includes(true)) throw new ProjectOpenError('holds-projects')
      return visible ? 'occupied' : 'blank'
    },
    open: async path => {
      const manifest = await loadManifest(path)
      await ensureMachineFolders(path)
      return await activate({ path, manifest })
    },
    rename: async (path, name) => {
      const manifest = await loadManifest(path)
      if (!isSafeFileName(name)) throw new ProjectRenameError('unsafe-name')
      const folder = join(dirname(path), name)
      const moved = await movedFolder(path, folder)
      const renamed: Project = { path: moved, manifest: { ...manifest, updatedAt: now() } }
      await writes.next(() => writeManifest(renamed))
      if (project?.path === path) return moved === path ? holding(renamed) : await activate(renamed)
      return renamed
    },
    current: () => project,
    path: () => {
      if (!project) throw new NoProjectError()
      return project.path
    },
    catalog: () => {
      if (!catalog) throw new NoProjectError()
      return catalog
    },
    roles: () => roleFolders,
    folderFor: async role => {
      if (!project) throw new NoProjectError()
      const root = project.path
      const held = (await roleFolderMissing(root, roleFolders, role))
        ? await readRoles(root)
        : roleFolders
      const folder = await ensureRoleFolder(root, held, role)
      const settled = { ...held, [role]: folder }
      if (roleFolders[role] !== folder || held !== roleFolders) {
        roleFolders = settled
        await writeRoleCache(root, settled)
        onRoles(settled)
      }
      return folder
    },
    touch: () => {
      const stamped = now()
      if (!project || project.manifest.updatedAt === stamped) return
      const stamping = { ...project, manifest: { ...project.manifest, updatedAt: stamped } }
      project = stamping
      void writes
        .next(() => writeManifest(stamping))
        .catch((error: unknown) => {
          log.warn('project', `stamping the manifest failed: ${String(error)}`)
        })
    },
    settled: writes.settled,
    duringWrite: write =>
      writes.next(async () => {
        if (!project || !catalog) throw new NoProjectError()
        return await write(project.path, catalog)
      }),
    close: async () => {
      const leaving = project?.path
      if (leaving === undefined) return
      await Promise.all([settle?.(), writes.settled()])
      if (project?.path !== leaving) return
      close()
      roleFolders = {}
      onChange(null)
      onRoles(roleFolders)
    },
  }
}

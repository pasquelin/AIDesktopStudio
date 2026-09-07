import { link, mkdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix } from 'node:path'
import { pathIsInside } from '@main/export/pathIsInside'
import { roleForAsset, withoutSourcePath, type Asset } from '@shared/domain/asset'
import { glbChunksOf } from '@shared/domain/glbContainer'
import { extensionOf } from '@shared/domain/fileName'
import type { FolderRole } from '@shared/domain/folderRole'
import {
  GLB_EXTENSION,
  isConvertibleType,
  SOURCES_FOLDER,
  type ConvertibleType,
} from '@shared/domain/meshImport'
import { EVENTS } from '@shared/ipc'
import type { ConvertMeshRequest } from '@shared/ipcExports'
import { orElse } from '@shared/promises'
import { broadcast } from '@main/ipc/broadcast'
import { hashOrNull } from '@main/media/runner'
import { exists } from '@main/persistence'
import { freeAssetPath, withExtension } from './assetFile'
import { assetFilePath } from './protocol'

export type ConvertedMeshDeps = {
  projectPath: () => string
  folderFor: (role: FolderRole) => Promise<string>
  find: (assetId: string) => Promise<Asset | null>
  add: (asset: Asset) => Promise<Asset>
  hash: (path: string) => Promise<string | null>
  now: () => string
}

type ConvertedMeshRecord = (entry: {
  level: 'info'
  topic: 'import'
  messageKey: 'activity.meshConverted'
  params: { name: string; from: string }
  assetId: string
}) => void

type ConvertedMeshHost = {
  folderFor: (role: FolderRole) => Promise<string>
  duringWrite: <T>(
    write: (
      root: string,
      catalog: { find: ConvertedMeshDeps['find']; add: ConvertedMeshDeps['add'] },
    ) => Promise<T>,
  ) => Promise<T>
}

/** Lands the glb, journals it, and answers the row the window may see. */
export async function saveConverted(
  request: ConvertMeshRequest,
  project: ConvertedMeshHost,
  record: ConvertedMeshRecord,
): Promise<Asset> {
  if (!glbChunksOf(request.glb)) throw new Error('expected a binary glTF payload')
  return await project.duringWrite(async (root, catalog) => {
    if (request.projectPath !== root) throw new Error('the conversion belongs to another project')
    const landed = await landConvertedMesh(request, {
      projectPath: () => root,
      folderFor: role => project.folderFor(role),
      find: id => catalog.find(id),
      add: asset => catalog.add(asset),
      hash: hashOrNull,
      now: () => new Date().toISOString(),
    })
    record({
      level: 'info',
      topic: 'import',
      messageKey: 'activity.meshConverted',
      params: { name: landed.name, from: landed.convertedFrom ?? '' },
      assetId: landed.id,
    })
    broadcast(EVENTS.assetsChanged, [landed])
    return withoutSourcePath(landed)
  })
}

type SourceMove = {
  kept: string
  packageFrom: string | null
  packageTo: string
  refiled: boolean
}

async function targetPath(
  root: string,
  existing: Asset & { path: string },
  type: ConvertibleType,
  folderFor: ConvertedMeshDeps['folderFor'],
): Promise<string> {
  // 🛑 A free name, not the source's with another extension: the import deduplicates on the WHOLE
  // file name, so a `Robot.fbx` lands happily beside an existing `Robot.glb` — and the conversion
  // then refused itself with « already exists », leaving the `.fbx` unconverted for ever.
  if (type === existing.type) {
    const folder = existing.path.slice(0, existing.path.lastIndexOf('/'))
    const wanted = withExtension(existing.path, GLB_EXTENSION)
    if (!(await exists(join(root, wanted)))) return wanted
    return await freeAssetPath(root, folder, existing.name, GLB_EXTENSION)
  }
  const folder = await folderFor(roleForAsset({ type }))
  if (!assetFilePath(root, folder)) throw new Error('asset path leaves the project')
  await mkdir(join(root, folder), { recursive: true })
  await requireExistingInside(root, folder)
  if (type !== 'animation') return freeAssetPath(root, folder, existing.name, GLB_EXTENSION)
  const own = await freeAssetPath(root, folder, existing.name, '')
  return `${own}/animation${GLB_EXTENSION}`
}

async function requireExistingInside(root: string, path: string): Promise<void> {
  if (!assetFilePath(root, path)) throw new Error('asset path leaves the project')
  const [projectRoot, directory] = await Promise.all([realpath(root), realpath(join(root, path))])
  if (!pathIsInside(projectRoot, directory)) throw new Error('asset path leaves the project')
}

async function moveSourcePackage(
  root: string,
  existing: Asset & { path: string },
  target: string,
  type: ConvertibleType,
  moveNeighbours: boolean,
): Promise<SourceMove> {
  const oldSources = posix.join(posix.dirname(existing.path), SOURCES_FOLDER)
  let packageTo = oldSources
  let packageFrom: string | null = null
  const refiled = existing.type !== type
  try {
    if (refiled) {
      const targetSources = posix.join(posix.dirname(target), SOURCES_FOLDER)
      packageTo = await freeAssetPath(root, targetSources, existing.name, '')
      if (moveNeighbours && (await exists(join(root, oldSources)))) {
        await requireExistingInside(root, oldSources)
        await requireExistingInside(root, posix.dirname(packageTo))
        if (!assetFilePath(root, packageTo)) throw new Error('asset path leaves the project')
        await rename(join(root, oldSources), join(root, packageTo))
        await requireExistingInside(root, packageTo)
        packageFrom = oldSources
      }
    }
    await mkdir(join(root, packageTo), { recursive: true })
    await requireExistingInside(root, packageTo)
    const kept = await freeAssetPath(root, packageTo, existing.name, extensionOf(existing.path))
    await rename(join(root, existing.path), join(root, kept))
    return { kept, packageFrom, packageTo, refiled }
  } catch (error) {
    if (packageFrom) {
      await orElse(rename(join(root, packageTo), join(root, packageFrom)), undefined)
    } else if (refiled) {
      await rm(join(root, packageTo), { recursive: true, force: true })
    }
    throw error
  }
}

async function restoreSourcePackage(
  root: string,
  source: string,
  moved: SourceMove | null,
): Promise<void> {
  if (!moved) return
  await mkdir(join(root, posix.dirname(source)), { recursive: true })
  await orElse(rename(join(root, moved.kept), join(root, source)), undefined)
  if (moved.packageFrom) {
    await mkdir(join(root, posix.dirname(moved.packageFrom)), { recursive: true })
    await orElse(rename(join(root, moved.packageTo), join(root, moved.packageFrom)), undefined)
  } else if (moved.refiled) {
    await rm(join(root, moved.packageTo), { recursive: true, force: true })
  }
}

function convertedAsset(
  existing: Asset,
  request: Omit<ConvertMeshRequest, 'projectPath'>,
  target: string,
  moved: SourceMove,
  fingerprint: string | null,
  at: string,
): Asset {
  const landed: Asset = {
    ...existing,
    type: request.type,
    path: target,
    bytes: request.glb.byteLength,
    localChangedAt: at,
    convertedFrom: moved.kept,
    importLosses: request.losses,
    ...(existing.remoteAssetId ? { syncStatus: 'local-ahead' } : {}),
  }
  if (fingerprint) landed.hash = fingerprint
  else delete landed.hash
  return landed
}

async function finishConversion(
  existing: Asset & { path: string },
  request: Omit<ConvertMeshRequest, 'projectPath'>,
  deps: ConvertedMeshDeps,
  target: string,
  fingerprint: string | null,
  moved: SourceMove,
): Promise<Asset> {
  const asset = await deps.add(
    convertedAsset(existing, request, target, moved, fingerprint, deps.now()),
  )
  if (moved.refiled)
    await orElse(rmdir(join(deps.projectPath(), posix.dirname(existing.path))), undefined)
  return asset
}

async function rollbackConversion(
  root: string,
  source: Asset & { path: string },
  request: Omit<ConvertMeshRequest, 'projectPath'>,
  target: string,
  staged: string,
  moved: SourceMove | null,
  targetCreated: boolean,
): Promise<void> {
  await rm(staged, { force: true })
  if (targetCreated) await rm(join(root, target), { force: true })
  await restoreSourcePackage(root, source.path, moved)
  if (source.type !== request.type && request.type === 'animation') {
    await orElse(rmdir(join(root, posix.dirname(target))), undefined)
  }
}

async function executeConversion(
  source: Asset & { path: string },
  request: Omit<ConvertMeshRequest, 'projectPath'>,
  deps: ConvertedMeshDeps,
  root: string,
  target: string,
): Promise<Asset> {
  const staged = join(root, posix.dirname(target), `.${basename(target)}.${source.id}.tmp`)
  let moved: SourceMove | null = null
  let targetCreated = false
  try {
    await mkdir(dirname(staged), { recursive: true })
    await requireExistingInside(root, posix.dirname(target))
    await writeFile(staged, request.glb, { flag: 'wx' })
    const fingerprint = await deps.hash(staged)
    const oldRoleFolder = await deps.folderFor(roleForAsset(source))
    const moveNeighbours = posix.dirname(source.path) !== oldRoleFolder
    moved = await moveSourcePackage(root, source, target, request.type, moveNeighbours)
    await link(staged, join(root, target))
    targetCreated = true
    await rm(staged)
    return await finishConversion(source, request, deps, target, fingerprint, moved)
  } catch (error) {
    await rollbackConversion(root, source, request, target, staged, moved, targetCreated)
    throw error
  }
}

/** Converts one newly imported row with a staged file and one final catalogue upsert. */
export async function landConvertedMesh(
  request: Omit<ConvertMeshRequest, 'projectPath'>,
  deps: ConvertedMeshDeps,
): Promise<Asset> {
  const existing = await deps.find(request.replaces)
  if (!existing?.path || existing.location !== 'local' || !isConvertibleType(existing.type)) {
    throw new Error(`asset ${request.replaces} is not a 3D file of the project`)
  }
  if (existing.convertedFrom !== undefined) {
    throw new Error(`asset ${request.replaces} was already converted`)
  }

  const sourceAsset = { ...existing, path: existing.path }
  const root = deps.projectPath()
  await requireExistingInside(root, sourceAsset.path)
  const target = await targetPath(root, sourceAsset, request.type, deps.folderFor)
  if (await exists(join(root, target))) throw new Error(`asset target ${target} already exists`)
  return await executeConversion(sourceAsset, request, deps, root, target)
}

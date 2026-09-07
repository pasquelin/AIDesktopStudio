import { refreshPalette } from '@/engines/core/palette'
import { LIST_ONLY } from '@/helpers/collectionState'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { installFakeBridge, type BridgeOverrides } from '@/services/fakeBridge'
import { useDocuments } from '@/stores/documents'
import { useExplorerView } from '@/stores/explorerView'
import { useFolderRoles } from '@/stores/folderRoles'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import type { Asset, AssetQuery } from '@shared/domain/asset'
import type { DocumentDescriptor } from '@shared/domain/document'
import { stemOf } from '@shared/domain/fileName'
import type { FileOutcome } from '@shared/domain/fileOp'
import { natureOf, opensInStudio } from '@shared/domain/fileRole'
import type { FolderEntry } from '@shared/domain/folder'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
const openDocument = vi.fn()
vi.mock('@/features/shell/components/dockviewApi', () => ({
  openDocument: (...args: unknown[]) => openDocument(...args),
}))

const openAsset = vi.hoisted(() => vi.fn<(asset: Asset) => Promise<void>>(() => Promise.resolve()))
vi.mock('@/helpers/openAsset', () => ({ openAsset }))

const { Explorer } = await import('./Explorer')

const scene: DocumentDescriptor = {
  id: 'a3f1',
  kind: 'scene',
  title: 'Niveau',
  workspace: '3d',
  path: 'a3f1.gltf',
}

/** Written in the open format, and a document all the same — whoever wrote the file. */
const montage: DocumentDescriptor = {
  id: 'cut',
  kind: 'sequence',
  title: 'Bande',
  workspace: 'video',
  path: 'Bande.otio',
}

/** A container, so one FILE — which is what the folder reader sees of it. */
const picture: DocumentDescriptor = {
  id: 'a3f1',
  kind: 'image',
  title: 'Planche',
  workspace: 'image',
  path: 'a3f1.ora',
}

const folder = (name: string, at = ''): FolderEntry => ({
  path: at === '' ? name : `${at}/${name}`,
  name,
  kind: 'folder',
})

const file = (name: string, at = ''): FolderEntry => ({
  path: at === '' ? name : `${at}/${name}`,
  name,
  kind: 'file',
})

const withProject = (): void => {
  useProject.setState({
    project: {
      path: '/projects/demo',
      manifest: { version: 1, createdAt: '', updatedAt: '' },
    },
  })
}

/** Reset per case in `beforeEach`, and read by `install` — every case here raises a menu. */
let menu = fakeMenu()

/** An empty batch, which is what a gesture nobody stubbed owes: nothing moved, nothing refused. */
const nothingMoved = (): Promise<FileOutcome> =>
  Promise.resolve({ done: [], refused: [], batch: 'batch-1' })

/**
 * What the main process answers per folder, so a test says what the disk holds and no more.
 *
 * `catalogued` is what the folder cannot say: whether a file it shows is an asset. Empty by
 * default, which is a folder of files the studio has never heard of.
 */
const WHEN_FACTS = '2026-08-17T10:00:00.000Z'

function adoptedAsset(relative: string, catalogued: readonly Asset[]): Promise<Asset | null> {
  const known = catalogued.find(asset => asset.path === relative)
  if (known) return Promise.resolve(known)
  const { domain, role } = natureOf(relative)
  if (role === 'edit' || domain === 'other' || domain === 'material' || !opensInStudio(relative)) {
    return Promise.resolve(null)
  }
  return Promise.resolve({
    id: `asset_${relative}`,
    name: stemOf(relative),
    type: domain,
    location: 'local',
    path: relative,
    tags: [],
    createdAt: WHEN_FACTS,
  })
}

function factsOf(
  relative: string,
  byFolder: Record<string, FolderEntry[]>,
  found: Record<string, FolderEntry[]>,
  walked: FolderEntry[],
) {
  const entry = [...Object.values(byFolder), ...Object.values(found), walked]
    .flat()
    .find(one => one.path === relative)
  return Promise.resolve(
    entry ? { kind: entry.kind, bytes: 12, createdAt: WHEN_FACTS, modifiedAt: WHEN_FACTS } : null,
  )
}

type ProjectBridge = NonNullable<BridgeOverrides['project']>

function connectExplorer(
  project: ProjectBridge,
  documents: DocumentDescriptor[],
  openFileInfo: () => Promise<void>,
  adopt: (relative: string) => Promise<Asset | null>,
  catalogued: readonly Asset[],
  update: (assetId: string) => Promise<Asset>,
): void {
  installFakeBridge({
    project,
    documents: { list: () => Promise.resolve(documents) },
    fileInfo: { open: openFileInfo },
    media: { adopt },
    menu: menu.bridge,
    assets: {
      search: (query: AssetQuery) =>
        Promise.resolve(
          catalogued.filter(asset =>
            query.paths ? query.paths.includes(asset.path ?? '') : asset.path === query.path,
          ),
        ),
      update,
    },
  })
}

function install(
  byFolder: Record<string, FolderEntry[]>,
  documents: DocumentDescriptor[] = [],
  catalogued: readonly Asset[] = [],
  /** What the whole folder answers per term — the panel's other source of nodes. */
  found: Record<string, FolderEntry[]> = {},
  /** Every file of the project, which is what the domain view reads. */
  walked: FolderEntry[] = [],
) {
  // The second argument is what the reader asked to SEE — the filtering is the main process's,
  // and is held there (`folder.test.ts`). What a case reads here is that the panel asked.
  const listFolder = vi.fn((relative: string, _hidden?: boolean) =>
    Promise.resolve(byFolder[relative] ?? []),
  )
  const searchFolder = vi.fn((term: string, _hidden?: boolean) =>
    Promise.resolve(found[term] ?? []),
  )
  const walkFolder = vi.fn((_hidden?: boolean) => Promise.resolve(walked))
  const openFile = vi.fn(() => Promise.resolve(true))
  const adopt = vi.fn((relative: string) => adoptedAsset(relative, catalogued))
  const fileFacts = vi.fn((relative: string) => factsOf(relative, byFolder, found, walked))
  const revealFile = vi.fn(() => Promise.resolve())
  const openFileInfo = vi.fn(() => Promise.resolve())
  const renameFile = vi.fn(nothingMoved)
  const moveFiles = vi.fn(nothingMoved)
  const trashFiles = vi.fn(nothingMoved)
  const duplicateFiles = vi.fn(nothingMoved)
  const pasteFiles = vi.fn(nothingMoved)
  const newFolder = vi.fn(nothingMoved)
  const undoFile = vi.fn(nothingMoved)
  const redoFile = vi.fn(nothingMoved)
  // What renaming an asset goes through: its file moves with its name, so the catalogue's
  // channel carries both — never `project.renameFile`, which refuses everything under `assets/`.
  const update = vi.fn((assetId: string) => {
    const held = catalogued.find(asset => asset.id === assetId)
    return held ? Promise.resolve(held) : Promise.reject(new Error('asset-not-found'))
  })
  const project = {
    listFolder,
    searchFolder,
    walkFolder,
    openFile,
    fileFacts,
    revealFile,
    renameFile,
    moveFiles,
    trashFiles,
    duplicateFiles,
    pasteFiles,
    newFolder,
    undoFile,
    redoFile,
  }
  connectExplorer(project, documents, openFileInfo, adopt, catalogued, update)
  return {
    ...project,
    adopt,
    openFileInfo,
    update,
  }
}

/** A gauge the stylesheet would apply, which jsdom does not. Dropped after every case. */
function declareGauge(gauge: string, value: string): void {
  document.documentElement.style.setProperty(gauge, value)
  // The token cache is module-level and shared: without this the next read answers the last case.
  refreshPalette()
}

beforeEach(() => {
  document.documentElement.style.removeProperty('--sc-control')
  document.documentElement.style.removeProperty('--sc-row-stacked')
  refreshPalette()
  vi.clearAllMocks()
  useDocuments.setState({ documents: {}, stored: [], activeId: null })
  // `known` settled: the panel says nothing at all until the main process has answered, and
  // every case below is about what it says once it has.
  useProject.setState({ project: null, known: true })
  // Persisted like the view above: a role one case resolved would badge a folder in the next.
  useFolderRoles.setState({ roles: {} })
  useLayouts.setState({ layout: null })
  // Persisted, so a term one case typed would narrow the tree of the next one.
  useExplorerView.setState({ collection: LIST_ONLY, hidden: false, mode: 'folder' })
  menu = fakeMenu()
  installFakeBridge({})
})

/**
 * The listing itself — the tree, or the grid when the panel is showing one.
 *
 * Scoped rather than read off `screen`: a name a row shows can appear elsewhere in the panel,
 * and a plain `getByText` on it then finds both.
 */
async function listing(): Promise<HTMLElement> {
  return waitFor(() => {
    const shown = screen.queryByRole('tree') ?? screen.queryByRole('listbox')
    if (!shown) throw new Error('the panel is drawing neither a tree nor a grid')
    return shown
  })
}

export {
  declareGauge,
  Explorer,
  file,
  folder,
  install,
  listing,
  menu,
  montage,
  nothingMoved,
  openAsset,
  openDocument,
  picture,
  scene,
  WHEN_FACTS,
  withProject,
}

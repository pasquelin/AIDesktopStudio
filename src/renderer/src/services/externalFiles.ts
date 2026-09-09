import i18next from 'i18next'
import type { Asset } from '@shared/domain/asset'
import type {
  ExternalFileImport,
  ExternalFileOffer,
  ExternalFileRefusal,
  ExternalFileRequest,
} from '@shared/domain/externalFile'
import type { AssetType } from '@shared/domain/asset'
import { importableAssetTypeOf, isImportableFile } from '@shared/domain/importFormat'
import { sourceNatureOf } from '@shared/domain/fileRole'
import { projectName, type RecentProject } from '@shared/domain/project'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { runTask } from '@/stores/tasks'
import type { DragLike, DropTone } from '@/helpers/drag'

type ExternalAssetReceiver = (asset: Asset) => boolean | void

type WaitingExternalFiles = {
  offer: ExternalFileOffer
  onImported?: ExternalAssetReceiver
}

const waiting: WaitingExternalFiles[] = []
let importing = false

function projectsToOffer(): RecentProject[] {
  const recent = [...useSettings.getState().settings.storage.recentProjects]
  const current = useProject.getState().project
  if (!current || recent.some(entry => entry.path === current.path)) return recent

  return [
    {
      path: current.path,
      openedAt: current.manifest.updatedAt,
      createdAt: current.manifest.createdAt,
    },
    ...recent,
  ]
}

async function chooseProject(): Promise<boolean> {
  const bridge = getBridge()
  if (!bridge) return false

  for (;;) {
    const current = useProject.getState().project
    const answer = await bridge.newDocument.ask({
      purpose: 'externalFiles',
      kind: null,
      surface: null,
      picked: null,
      projectName: current ? projectName(current.path) : null,
      recentProjects: projectsToOffer(),
      open: Object.values(useDocuments.getState().documents),
    })
    if (!answer) return false

    if (answer.answer === 'recentProject') {
      if (await useProject.getState().open(answer.path)) return true
      continue
    }

    const before = current?.path
    if (answer.answer === 'newProject') await useProject.getState().createPicked()
    if (answer.answer === 'openProject') await useProject.getState().openPicked()
    if (useProject.getState().project?.path !== before) return true
  }
}

async function importRequest(
  request: ExternalFileRequest,
  onImported?: ExternalAssetReceiver,
): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  const elsewhere = request.project && request.project !== useProject.getState().project?.path
  if (elsewhere || (request.folder === undefined && !(await chooseProject()))) {
    await bridge.externalFiles.discard(request.id)
    return
  }

  const imported = await runTask(i18next.t('activity.importingFiles'), id =>
    bridge.media.ingestPaths(request.id, request.folder ?? '', id),
  )
  // A stop undoes nothing the main already copied and adopted, and its answer is dropped with the
  // race it lost — without this the catalogue holds rows the browser never shows.
  if (!imported) return await useAssets.getState().refresh()
  await handImported(imported, onImported)
}

export function reportImportNotices(imported: ExternalFileImport): void {
  reportUnopenedExternalFiles(imported.refused)
  for (const name of imported.failed) {
    reportNotice('assets.copy', i18next.t('activity.importFailed', { name }))
  }
}

async function handImported(
  imported: ExternalFileImport,
  onImported?: ExternalAssetReceiver,
): Promise<void> {
  reportImportNotices(imported)
  if (imported.montages.length > 0) {
    const { openImportedOtioz } = await import('@/features/shell/otioImport')
    for (const montage of imported.montages) await openImportedOtioz(montage)
  }

  if (imported.assets.length > 0) await useAssets.getState().refresh()
  // BEFORE the stills and before the tabs: both read the file, and a `.fbx` that is about to
  // become a `.glb` is not the file either should read. The rows come back as they now stand.
  const { convertArrivedModels } = await import('./meshConversion')
  const assets = await convertArrivedModels(imported.assets)
  // AFTER the refresh and after the montages: a render costs seconds each, and awaiting the
  // batch first held a dropped `.otioz` behind fifty clips. The pass refreshes again itself.
  const { generateAnimationThumbnails } = await import('./animationThumbnails')
  await generateAnimationThumbnails(assets)
  if (imported.documents.length > 0) {
    await useDocuments.getState().relist()
    const { openDocument } = await import('@/features/shell/components/dockviewApi')
    for (const document of imported.documents) openDocument(document)
  }
  if (onImported) {
    const unhandled = assets.filter(asset => onImported(asset) === false)
    if (unhandled.length === 0) return
    await openExternalAssets(unhandled)
    return
  }
  await openExternalAssets(assets)
}

async function openExternalAssets(assets: readonly Asset[]): Promise<void> {
  const { openAsset } = await import('@/helpers/openAsset')
  for (const asset of assets) {
    // A batch of motions belongs in the library. Opening each would stack them on the character.
    if (asset.type === 'animation') continue
    if (sourceNatureOf(asset.path ?? asset.name).openable) await openAsset(asset)
  }
}

async function drain(): Promise<void> {
  if (importing) return
  importing = true
  try {
    while (waiting.length > 0) {
      const arrival = waiting.shift()
      if (!arrival) continue
      reportRefusedExternalFiles(arrival.offer)
      const request = arrival.offer.request
      if (!request) continue
      try {
        await importRequest(request, arrival.onImported)
      } catch (error) {
        reportFailure('assets.copy', request.id, error)
        // The main holds the authorised paths until the request is claimed or dropped: a failure
        // that says neither leaves them held for the life of the app.
        try {
          await getBridge()?.externalFiles.discard(request.id)
        } catch {
          // The bridge is gone, and the entry goes with the process it lived in.
        }
      }
    }
  } finally {
    importing = false
  }
}

export function queueExternalFiles(
  offers: readonly ExternalFileOffer[],
  onImported?: ExternalAssetReceiver,
): void {
  waiting.push(...offers.map(offer => ({ offer, ...(onImported ? { onImported } : {}) })))
  void drain()
}

export async function takeExternalFiles(): Promise<void> {
  const requests = await getBridge()?.externalFiles.take()
  if (requests) queueExternalFiles(requests)
}

export async function offerExternalFiles(
  files: readonly File[] | FileList | undefined,
): Promise<ExternalFileOffer | null> {
  const bridge = getBridge()
  if (!bridge || !files) return null
  try {
    return await bridge.externalFiles.offer([...files])
  } catch (error) {
    reportFailure('assets.copy', 'external-file-drop', error)
    return null
  }
}

export async function importExternalFiles(
  files: readonly File[] | FileList,
  onImported: ExternalAssetReceiver,
): Promise<void> {
  const offer = await offerExternalFiles(files)
  if (!offer) return
  queueExternalFiles([externalFileOfferForCurrentProject(offer)], onImported)
}

export async function importExternalFilesInto(
  files: readonly File[] | FileList,
  accepts: readonly AssetType[],
  onImported: ExternalAssetReceiver,
): Promise<void> {
  const offer = await offerExternalFiles(files)
  if (!offer) return
  queueExternalFiles([externalFileOfferForCurrentProject(offer)], asset => {
    if (!accepts.includes(asset.type)) return false
    return onImported(asset)
  })
}

export function carriesExternalFiles(event: DragLike): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

export function externalFileDropTone(event: DragLike): DropTone | null {
  if (!carriesExternalFiles(event)) return null
  const names = externalFileNames(event)
  if (names.length === 0) return 'neutral'
  return dropToneOf(names.map(isImportableFile))
}

export function externalFileTargetTone(
  event: DragLike,
  accepts: readonly AssetType[],
): DropTone | null {
  if (!carriesExternalFiles(event)) return null
  const names = externalFileNames(event)
  if (names.length === 0) return 'neutral'
  return dropToneOf(
    names.map(name => {
      const type = importableAssetTypeOf(name)
      return type !== null && accepts.includes(type)
    }),
  )
}

function dropToneOf(accepted: readonly boolean[]): DropTone {
  if (accepted.every(Boolean)) return 'accepted'
  return accepted.some(Boolean) ? 'partial' : 'refused'
}

function externalFileNames(event: DragLike): string[] {
  const transfer = event.dataTransfer
  if (!transfer) return []
  const files = [...transfer.files]
  if (files.length > 0) return files.map(file => file.name)
  return Array.from(transfer.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile()?.name ?? '')
    .filter(Boolean)
}

export function externalFileOfferInto(
  offer: ExternalFileOffer,
  folder: string,
  project: string | null,
): ExternalFileOffer {
  return {
    ...offer,
    request: offer.request ? { ...offer.request, folder, ...(project ? { project } : {}) } : null,
  }
}

function externalFileOfferForCurrentProject(offer: ExternalFileOffer): ExternalFileOffer {
  const project = useProject.getState().project
  return project ? externalFileOfferInto(offer, '', project.path) : offer
}

function reportRefusedExternalFiles(offer: ExternalFileOffer): void {
  if (offer.refused.length === 0) return
  const extensions = [
    ...new Set(offer.refused.map(file => (file.extension ? `.${file.extension}` : file.name))),
  ].join(', ')
  reportNotice(
    'assets.copy',
    i18next.t('activity.unsupportedFiles', {
      count: offer.refused.length,
      names: offer.refused.map(file => file.name).join(', '),
      extensions,
    }),
  )
}

/**
 * What a refusal earned AFTER the copy says, which is never what the offer's says: the extension
 * passed `isImportableFile`, so the format IS supported and only this file did not open.
 */
function reportUnopenedExternalFiles(refused: readonly ExternalFileRefusal[]): void {
  if (refused.length === 0) return
  reportNotice(
    'assets.copy',
    i18next.t('activity.notOpenedFiles', {
      count: refused.length,
      names: refused.map(file => file.name).join(', '),
    }),
  )
}

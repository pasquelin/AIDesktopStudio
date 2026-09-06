import i18next from 'i18next'
import type { Asset } from '@shared/domain/asset'
import { projectFileUrl } from '@shared/domain/assetAccess'
import {
  isConvertibleType,
  needsMeshConversion,
  type MeshImportLoss,
} from '@shared/domain/meshImport'
import { messageOf } from '@shared/guards'
import { extensionOf } from '@shared/domain/fileName'
import { meshFormatForExtension } from '@shared/domain/meshFormat'
import { assetArrayBuffer } from '@/helpers/assetFetch'
import { formatList } from '@/helpers/format'
import { breathe } from '@/engines/core/breathe'
import { convertModelToGlb } from '@/engines/scene/modelConversion'
import { getBridge } from './bridge'
import { reportFailure, reportNotice } from './diagnostics'
import { useAssets } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { runTask } from '@/stores/tasks'

/** Converts announced 3D arrivals; a project that predates the rule stays untouched. */

/** One answer per live conversion, shared by announcements and their explicit importer. */
const converting = new Map<string, Promise<Asset | null>>()
const completed = new Map<string, Asset>()
let completedProject = ''
let preceding = Promise.resolve()

/** Converts what needs it among these rows. Never rejects: failures are reported inside. */
export async function convertArrivedModels(assets: readonly Asset[]): Promise<Asset[]> {
  const projectPath = useProject.getState().project?.path ?? ''
  if (projectPath !== completedProject) {
    completed.clear()
    completedProject = projectPath
  }
  const keyOf = (asset: Asset): string => `${projectPath}\0${asset.id}`
  const waiting = assets.filter(
    asset =>
      needsMeshConversion(asset) && !converting.has(keyOf(asset)) && !completed.has(keyOf(asset)),
  )
  const landed = new Map<string, Asset>()
  if (waiting.length > 0) startConversions(waiting, landed, keyOf)
  return await Promise.all(
    assets.map(async asset => {
      const key = keyOf(asset)
      return (await converting.get(key)) ?? completed.get(key) ?? landed.get(asset.id) ?? asset
    }),
  )
}

function startConversions(
  waiting: readonly Asset[],
  landed: Map<string, Asset>,
  keyOf: (asset: Asset) => string,
): void {
  const prior = preceding
  const batch = runConversionsAfter(prior, waiting, landed)
  preceding = batch
  for (const asset of waiting) {
    const key = keyOf(asset)
    converting.set(key, conversionResult(key, asset.id, batch, landed))
  }
}

async function runConversionsAfter(
  prior: Promise<void>,
  waiting: readonly Asset[],
  landed: Map<string, Asset>,
): Promise<void> {
  await prior
  try {
    await convertEach(waiting, landed)
  } catch (error) {
    reportFailure('assets.copy', 'mesh-conversion', error)
  }
}

async function conversionResult(
  key: string,
  assetId: string,
  batch: Promise<void>,
  landed: Map<string, Asset>,
): Promise<Asset | null> {
  try {
    await batch
    const result = landed.get(assetId) ?? null
    if (result) completed.set(key, result)
    return result
  } finally {
    converting.delete(key)
  }
}

/** Watches the catalogue for arrivals the import did not hand over. Answers the stop. */
export function connectMeshConversion(): () => void {
  const bridge = getBridge()
  if (!bridge) return () => undefined
  return bridge.assets.onChanged(changed => {
    void convertArrivedModels(changed)
  })
}

async function convertEach(waiting: readonly Asset[], landed: Map<string, Asset>): Promise<void> {
  const bridge = getBridge()
  const projectPath = useProject.getState().project?.path
  if (!bridge || !projectPath) return

  let completion = Promise.resolve()
  await runTask(i18next.t('activity.meshConverting'), (_id, watch) => {
    completion = convertWaiting(waiting, landed, bridge, projectPath, watch)
    return completion
  })
  await completion
}

async function convertWaiting(
  waiting: readonly Asset[],
  landed: Map<string, Asset>,
  bridge: NonNullable<ReturnType<typeof getBridge>>,
  projectPath: string,
  watch: Parameters<Parameters<typeof runTask>[1]>[1],
): Promise<void> {
  let done = 0
  for (const asset of waiting) {
    // Read at every step: a pass outlives the project it began in.
    if (watch.signal?.aborted || useProject.getState().project?.path !== projectPath) return
    const converted = await convertOne(asset, bridge, projectPath, watch.signal)
    if (converted) landed.set(asset.id, converted)
    done += 1
    watch.onStep?.(done, waiting.length)
    await breathe()
  }
  if (landed.size > 0) await useAssets.getState().refresh()
}

/** One row, from its bytes to the row the main answers. A failure is said, and answers `null`. */
async function convertOne(
  asset: Asset,
  bridge: NonNullable<ReturnType<typeof getBridge>>,
  projectPath: string,
  signal?: AbortSignal,
): Promise<Asset | null> {
  if (!asset.path || !isConvertibleType(asset.type)) return null
  try {
    const format = meshFormatForExtension(extensionOf(asset.path).slice(1))
    if (format === null) throw new Error('not a 3D file this build converts')
    const converted = await convertModelToGlb(
      await assetArrayBuffer(asset.id),
      projectFileUrl(asset.id),
      asset.type,
      format,
      { readText },
    )
    if (signal?.aborted || useProject.getState().project?.path !== projectPath) return null
    const landed = await bridge.assets.saveConverted({
      replaces: asset.id,
      projectPath,
      glb: converted.glb,
      type: converted.type,
      losses: converted.losses,
    })
    if (converted.losses.length > 0) sayLosses(asset.name, converted.losses)
    return landed
  } catch (error) {
    reportFailure('assets.copy', asset.name, error)
    reportNotice(
      'assets.copy',
      i18next.t('activity.meshConversionFailed', { name: asset.name, reason: messageOf(error) }),
    )
    return null
  }
}

function sayLosses(name: string, losses: readonly MeshImportLoss[]): void {
  const named = losses.map(loss => i18next.t(`activity.importLoss.${loss}`))
  reportNotice(
    'assets.copy',
    i18next.t('activity.meshConversionLost', {
      name,
      losses: formatList(named, i18next.language, 'conjunction'),
    }),
  )
}

async function readText(url: string): Promise<string | null> {
  try {
    const answer = await fetch(url)
    return answer.ok ? await answer.text() : null
  } catch {
    // A neighbour that is not there is a loss the conversion names, not a failure.
    return null
  }
}

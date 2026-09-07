import i18next from 'i18next'
import { workspaceForKind } from '@shared/domain/document'
import { importSourceOf, lossesImportingFrom } from '@shared/domain/importRegistry'
import { stemOf } from '@shared/domain/fileName'
import type { MontageImportResult } from '@shared/ipc'
import { montageRebuildsExtended } from '@/engines/timeline/otioTimeline'
import type { SequenceState } from '@/engines/timeline/timelineState'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { runTask } from '@/stores/tasks'
import { sequenceStore } from '@/stores/sequences'
import { openDocument } from './components/dockviewApi'
import { saveDocument } from './documentIo'
import { sequenceFromPayload } from './sequenceDocument'

/**
 * What THIS file does not bring. Read off the payload, never off the registry alone: a `.otioz`
 * this studio wrote brings every extended trait back, and saying they were lost over a montage
 * that plays its fades is the lie this chantier is against.
 */
function sayWhatIsNotRebuilt(payload: unknown): void {
  if (montageRebuildsExtended(payload)) return

  const losses = lossesImportingFrom('montage.otioz')
  if (losses.length === 0) return

  // The trait names as they are, which is what the flatten refusal already writes: nothing in
  // this repo translates them, and inventing nineteen labels here would be the first surface to.
  reportNotice('document.load', i18next.t('documents.importLoses', { parts: losses.join(', ') }))
}

/**
 * The cut, through the SAME door a document read off disk goes through: the carried metadata
 * kept, what was let go of said, the save refused. Keyed by the ENTRY, which is what the bundle
 * rewrote every `target_url` to.
 */
export function sequenceOfBundle(
  { content, media }: MontageImportResult,
  documentId: string,
): SequenceState {
  const payload: unknown = JSON.parse(content)

  sayWhatIsNotRebuilt(payload)
  return sequenceFromPayload(
    payload,
    documentId,
    new Map(media.map(one => [one.entry, one.assetId])),
  )
}

/**
 * Reads a montage bundle into the project and opens it. Answers the new document's id, or `null`
 * for a dismissed picker, no project, or a stopped read.
 */
export async function importOtioz(): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null

  try {
    const read = await runTask(i18next.t('documents.importing'), id => bridge.montage.import(id))
    if (!read) return null

    return await openImportedOtioz(read)
  } catch (error) {
    reportFailure('sequence.import', 'montage.otioz', error)
    return null
  }
}

export async function openImportedOtioz(read: MontageImportResult): Promise<string | null> {
  const workspace = workspaceForKind(importSourceOf('montage.otioz').kind)
  if (!workspace) return null
  await useAssets.getState().refresh()
  const created = await useDocuments
    .getState()
    .create(workspace, { title: stemOf(read.folder), folder: read.folder })
  if (!created) return null

  sequenceStore.use.getState().replace(created.id, sequenceOfBundle(read, created.id))
  openDocument(created)
  await saveDocument(created.id, false)
  return created.id
}

import { localizedError } from '@shared/localizedError'
import i18next from 'i18next'
import { reportFailure, reportNotice } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { useSettings } from '@/stores/settings'
import type { DocumentDescriptor } from '@shared/domain/document'
import { destinationFormatsFor, nearestEncodableFor } from '@shared/domain/encodableFormat'
import { parentOf } from '@shared/domain/folder'
import type { NamedDocumentPlace } from '@shared/domain/newDocument'
import { projectName } from '@shared/domain/project'
import type { StudioBridge } from '@shared/ipc'
import { getBridge } from '@/services/bridge'
import { openDocument } from './components/dockviewApi'
import type { CapturedDraft } from './documentIoAdapters'
import { newId } from '@/helpers/ids'
import { createScript } from './createScript'
import {
  forgetDocument,
  writableDocument,
  type AssetWritingIo,
  type FileWritingIo,
} from './documentTab'

/**
 * The folder the window opens on: where this document's own file sits.
 *
 * The ASSET's folder for a document opened to edit one, and not the document's `path`, which for
 * such a tab still names the address a document file WOULD have had — a folder nothing is in.
 */
function folderOf(document: DocumentDescriptor): string | null {
  const source = document.sourceAssetId
  const path = source ? assetsById(useAssets.getState()).get(source)?.path : undefined
  return parentOf(path ?? document.path)
}

/** Where the document is to be written, or `null` when the window was closed or cancelled. */
async function askWhereToSave(
  document: DocumentDescriptor,
  copy?: true,
): Promise<NamedDocumentPlace | null> {
  const bridge = getBridge()
  // ASKED, never read off the project store: that store settles unsaved work, so it reaches the
  // save this module is called from — and the import graph carries no cycle. The round trip is
  // for a rare, deliberate gesture, and the window it opens costs far more than it does.
  const project = await bridge?.project.current()
  if (!bridge || !project) return null
  // The folders FIRST, as `askFor` does: what they hold is what a typed name is refused against,
  // and a field open over a stale listing accepts a name the disk already holds.
  await useDocuments.getState().relist()

  const answer = await bridge.newDocument.ask({
    purpose: {
      of: 'saveAs',
      ...(copy ? { copy } : {}),
      title: document.title,
      formats: destinationFormatsFor(document.kind),
    },
    kind: document.kind,
    surface: null,
    picked: folderOf(document),
    projectName: projectName(project.path),
    recentProjects: useSettings.getState().settings.storage.recentProjects,
    open: Object.values(useDocuments.getState().documents),
  })

  return answer?.answer === 'made' ? answer.place : null
}

/**
 * A picture written where the person chose, and the tab carried on to it.
 *
 * The document is REPOINTED rather than duplicated: its destination is the asset it edits, so
 * moving that link is the whole of « the new destination becomes the active one » (§5.3). No
 * second tab, no history thrown away, and the file it was opened from is left exactly as it was.
 */
async function intoNewAsset(
  document: DocumentDescriptor,
  io: AssetWritingIo,
  place: NamedDocumentPlace,
  draft: CapturedDraft,
): Promise<boolean> {
  const format = place.format ?? nearestEncodableFor('picture', io.traitsOf(document.id))
  try {
    const written = await io.writeAsset(
      document.id,
      {
        name: place.title,
        format,
        folder: place.folder,
        documentId: document.id,
        ...(document.sourceAssetId ? { derivedFrom: document.sourceAssetId } : {}),
      },
      draft,
    )
    if (!written) throw localizedError('bakeContentEmpty')
    // The ROW that came back, never the name that was typed: a folder already holding that file
    // frees the name, and a tab titled otherwise would name a file nobody wrote. Its path travels
    // with it, which is what keeps one file to one document across a catalogue rebuild.
    useDocuments.getState().retarget(document.id, written)
    // Together: the shelf and the document listing share nothing, and one waiting on the other
    // is a second round trip in series for a gesture that has already opened a window.
    await Promise.all([useAssets.getState().refresh(), useDocuments.getState().relist('own-write')])
    return true
  } catch (error) {
    reportFailure('assets.save', document.title, error)
    return false
  }
}

/**
 * A document file written where the person chose, and the tab moved to it.
 *
 * A NEW document, unlike the picture above, and the file format is what forces it: a document's
 * id is written INSIDE its file, so a second file carrying the first one's id would leave two
 * rows of a listing claiming one document, and the next session free to open either. The file
 * that was open keeps its id and its last saved bytes; the tab carries on with the new one,
 * filled from the very draft that was just written.
 */
async function intoNewFile(
  bridge: StudioBridge,
  document: DocumentDescriptor,
  io: FileWritingIo,
  place: NamedDocumentPlace,
  draft: CapturedDraft,
): Promise<boolean> {
  const created = await useDocuments
    .getState()
    .create(document.workspace, { kind: document.kind, title: place.title, folder: place.folder })
  if (!created) return false

  const written = await bridge.documents.write(
    created.id,
    created.kind,
    { ...draft, title: created.title },
    false,
    { folder: place.folder },
  )
  if (written !== 'written') {
    useDocuments.getState().close(created.id)
    return false
  }

  io.install(created.id, draft.content, draft.parts)
  openDocument(created)
  forgetDocument(document.id)
  await useDocuments.getState().relist('own-write')
  return true
}

/** A script written where the person chose — `createScript` says why it is its own door. */
async function intoNewScript(
  document: DocumentDescriptor,
  place: NamedDocumentPlace,
  draft: CapturedDraft,
): Promise<boolean> {
  const created = await createScript({ title: place.title, folder: place.folder }, draft.content)
  if (!created) return false
  forgetDocument(document.id)
  return true
}

/**
 * A copy written where the person chose, the document carrying on where it is — §5.3, third row.
 *
 * What tells it from « Save as » is the one thing that does not happen: nothing is retargeted.
 * The tab keeps its destination, its history and its place in the layout, and what is written is
 * a file of its own — a NEW document id for a file document, since a document's id lives inside
 * its file and two files may not claim one.
 *
 * No tab is opened on it either: a copy is something one makes and goes on working, and the
 * listing is where it turns up.
 */
export async function saveDocumentCopy(documentId: string): Promise<boolean> {
  const savable = writableDocument(documentId)
  if (!savable) return false
  const { bridge, document, io } = savable
  if (io.assetOnly) {
    // Same reason as « Save as »: the character's tab edits a model of the library, and its
    // skeleton belongs in that model's own container.
    reportNotice('document.save', i18next.t('documents.saveAsUnavailable'))
    return false
  }
  await io.settled?.(documentId)

  const place = await askWhereToSave(document, true)
  if (!place) return false

  const { draft } = await io.capture(documentId)
  // 🛑 `commit` is NOT called: the document has not been saved, a copy of it has. Marking the
  // work as written would leave the real destination behind with nothing saying so.
  return io.writeAsset
    ? await copiedAsset(document, io, place, draft)
    : await copiedFile(bridge, document, place, draft)
}

/** The copy of a picture: another row of the library, and the tab stays on the one it edits. */
async function copiedAsset(
  document: DocumentDescriptor,
  io: AssetWritingIo,
  place: NamedDocumentPlace,
  draft: CapturedDraft,
): Promise<boolean> {
  const format = place.format ?? nearestEncodableFor('picture', io.traitsOf(document.id))
  try {
    const written = await io.writeAsset(
      document.id,
      {
        name: place.title,
        format,
        folder: place.folder,
        ...(document.sourceAssetId ? { derivedFrom: document.sourceAssetId } : {}),
      },
      draft,
    )
    if (!written) throw localizedError('bakeContentEmpty')
    await useAssets.getState().refresh()
    return true
  } catch (error) {
    reportFailure('assets.save', document.title, error)
    return false
  }
}

/** The copy of a document file: its own file, under an id of its own, and no tab on it. */
async function copiedFile(
  bridge: StudioBridge,
  document: DocumentDescriptor,
  place: NamedDocumentPlace,
  draft: CapturedDraft,
): Promise<boolean> {
  const written = await bridge.documents.write(
    newId(),
    document.kind,
    { ...draft, title: place.title },
    false,
    { folder: place.folder },
  )
  if (written !== 'written') return false
  await useDocuments.getState().relist('own-write')
  return true
}

/**
 * ⇧⌘S — a destination chosen, written, and made this document's own (§5.3).
 *
 * It used to write `<name> copie` beside the file with nothing asked and stand a second tab on
 * it: a « save a copy AND switch to it », which is neither of the two gestures the menu names.
 * What it writes now is what was asked for, where it was asked for, in the format that was asked
 * for — and the tab saves there from now on.
 *
 * Not stopped by the refusals a ⌘S meets, and that is the point of it: a file the studio did not
 * read whole, one whose format its writers cannot keep, one it may not overwrite — each of those
 * is a reason to write SOMEWHERE ELSE, which is what this does.
 */
export async function saveDocumentAs(documentId: string): Promise<boolean> {
  const savable = writableDocument(documentId)
  if (!savable) return false
  const { bridge, document, io } = savable
  if (io.assetOnly) {
    // The character has no destination to choose: its tab edits a model of the library, and the
    // skeleton it writes belongs in that model's own container.
    reportNotice('document.save', i18next.t('documents.saveAsUnavailable'))
    return false
  }
  await io.settled?.(documentId)

  const place = await askWhereToSave(document)
  if (!place) return false

  const { draft, commit } = await io.capture(documentId)
  const written = io.writeAsset
    ? await intoNewAsset(document, io, place, draft)
    : document.kind === 'script'
      ? await intoNewScript(document, place, draft)
      : await intoNewFile(bridge, document, io, place, draft)
  if (!written) return false

  commit()
  return true
}

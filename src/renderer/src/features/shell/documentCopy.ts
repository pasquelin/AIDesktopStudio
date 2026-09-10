import { localizedError } from '@shared/localizedError'
import i18next from 'i18next'
import { reportFailure } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'
import { useDocuments } from '@/stores/documents'
import { takenDocumentNames } from '@/stores/documentNames'
import { documentFolderOf, type DocumentDescriptor } from '@shared/domain/document'
import { nextFreeDocumentName } from '@shared/domain/documentName'
import { openDocument } from './components/dockviewApi'
import { savableDocument, writePlanFor, type SavableDocument } from './documentIo'

/**
 * What a copy is called, freed of a name the folder already holds: the store leaves a view of an
 * asset its asset's name, and copying one document twice stood two tabs on one file, each saving
 * over the other (2026-09-09).
 */
const copyName = (document: DocumentDescriptor): string =>
  nextFreeDocumentName(
    i18next.t('documents.copyName', { name: document.title }),
    document.kind,
    takenDocumentNames(useDocuments.getState(), documentFolderOf(document.kind)),
  )

async function copyDocumentAsset(
  documentId: string,
  { document, io }: SavableDocument,
): Promise<boolean> {
  const source = document.sourceAssetId
  if (!source || !io.writeAsset || io.assetOnly) {
    reportFailure('assets.copy', document.title, localizedError('copyContentEmpty'))
    return false
  }
  const name = copyName(document)
  const { format, losses } = writePlanFor(document, io, source)
  try {
    const { draft } = await io.capture(documentId)
    const copy = await io.writeAsset(
      documentId,
      { derivedFrom: source, name, format: losses.length === 0 ? format : 'ora' },
      draft,
    )
    if (!copy) {
      reportFailure('assets.copy', document.title, localizedError('bakeContentEmpty'))
      return false
    }
    return await standUpCopy(document, name, copy.id)
  } catch (error) {
    reportFailure('assets.copy', document.title, error)
    return false
  }
}

/**
 * The tab the copy carries on in. Its fidelity is `faithful` and can be nothing else: the copy IS
 * what the studio holds, written whole, so nothing was read to make it and nothing reduced.
 *
 * The copy's own file is the ASSET that was just written, and no document file is laid beside it:
 * one destination per document, exactly as `writeWhereItBelongs` says.
 */
async function standUpCopy(
  document: DocumentDescriptor,
  name: string,
  copyId: string,
): Promise<boolean> {
  const created = await useDocuments
    .getState()
    .create(document.workspace, { title: name, sourceAssetId: copyId, sourceFidelity: 'faithful' })
  if (!created) {
    reportFailure('assets.copy', document.title, localizedError('copyDocumentMissing'))
    return false
  }
  openDocument(created)
  await useAssets.getState().refresh()
  void useDocuments.getState().relist('own-write')
  return true
}

export async function saveDocumentAs(documentId: string): Promise<boolean> {
  const savable = savableDocument(documentId)
  return savable ? await copyDocumentAsset(documentId, savable) : false
}

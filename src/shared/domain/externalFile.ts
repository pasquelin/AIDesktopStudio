import type { Asset } from './asset'
import type { DocumentDescriptor } from './document'
import type { MontageImportResult } from '../ipcExports'

/** Files handed to the studio by the operating system or a desktop drop. */
export type ExternalFileRequest = {
  id: string
  folder?: string
  project?: string
}

export type ExternalFileRefusal = {
  name: string
  extension: string
}

export type ExternalFileOffer = {
  request: ExternalFileRequest | null
  refused: readonly ExternalFileRefusal[]
}

export type ExternalFileImport = {
  assets: readonly Asset[]
  documents: readonly DocumentDescriptor[]
  montages: readonly MontageImportResult[]
  refused: readonly ExternalFileRefusal[]
  failed: readonly string[]
}

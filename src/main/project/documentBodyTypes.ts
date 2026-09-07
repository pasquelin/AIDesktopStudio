import type { DocumentEnvelope, DocumentFile } from '@shared/domain/document'

export type DocumentHead = DocumentEnvelope & { content?: string }

export type DocumentBodyFormat = {
  read: (body: Buffer) => DocumentFile
  write: (document: DocumentFile) => string | Uint8Array
  readHead: (file: string) => Promise<DocumentHead>
}

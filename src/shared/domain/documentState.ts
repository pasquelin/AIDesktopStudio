import type { DocumentKind } from './document'

export type DocumentStateSnapshot = {
  documentId: string
  kind: DocumentKind
  incarnation: string
  revision: number
  state: unknown
}

export type DocumentRevisionSnapshot = Omit<DocumentStateSnapshot, 'state'>

import { DOCUMENT_VERSION, type DocumentEnvelope } from '@shared/domain/document'
import type { DocumentBodyFormat } from './documentBodyTypes'

const plainEnvelope = (): DocumentEnvelope => ({
  version: DOCUMENT_VERSION,
  kind: 'script',
  title: '',
  updatedAt: '',
})

export const PLAIN_TEXT: DocumentBodyFormat = {
  read: body => ({ ...plainEnvelope(), content: body.toString('utf8') }),
  write: document => document.content,
  readHead: () => Promise.resolve(plainEnvelope()),
}

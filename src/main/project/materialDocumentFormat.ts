import {
  DOCUMENT_ID_KEY,
  DOCUMENT_KIND_KEY,
  DOCUMENT_VERSION,
  type DocumentEnvelope,
  type DocumentFile,
  isDocumentKind,
} from '@shared/domain/document'
import { isMtlxDocument, MTLX_HEAD_LIMIT } from '@shared/domain/materialX'
import { isRecord, readString } from '@shared/guards'
import { firstBytes } from '@main/persistence'
import { mtlxHeadIn, readMaterialX, writeMaterialX } from '@main/assets/materialXFile'
import { parseDocumentEnvelope } from './validation'
import { studioStamp } from './gltfDocumentBody'
import type { DocumentBodyFormat } from './documentBodyTypes'

const jsonOrNull = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

function mtlxEnvelope(envelope: string): DocumentEnvelope {
  const held = envelope ? jsonOrNull(envelope) : null
  const studio = isRecord(held) ? held : {}
  const id = readString(studio, DOCUMENT_ID_KEY, '')
  const kind = readString(studio, DOCUMENT_KIND_KEY, '')
  return {
    version: DOCUMENT_VERSION,
    kind: isDocumentKind(kind) ? kind : 'material',
    title: '',
    updatedAt: '',
    ...(id ? { id } : {}),
  }
}

export function createMaterialDocumentFormat(legacy: DocumentBodyFormat): DocumentBodyFormat {
  const read = (body: Buffer): DocumentFile => {
    const text = body.toString('utf8')
    const { version, envelope } = mtlxHeadIn(text)
    return version
      ? { ...mtlxEnvelope(envelope), content: JSON.stringify(readMaterialX(text)) }
      : legacy.read(body)
  }
  return {
    read,
    write: document => {
      const parsed = jsonOrNull(document.content)
      return isMtlxDocument(parsed)
        ? writeMaterialX(parsed, JSON.stringify(studioStamp({}, document)))
        : legacy.write(document)
    },
    readHead: async file => {
      const head = (await firstBytes(file, MTLX_HEAD_LIMIT)).toString('utf8')
      const cut = head.indexOf('\n')
      const first = cut === -1 ? null : jsonOrNull(head.slice(0, cut))
      if (isRecord(first)) return parseDocumentEnvelope(first)
      const { version, envelope } = mtlxHeadIn(head)
      if (!version) throw new Error('Not a MaterialX document')
      if (!envelope) throw new Error('Nothing of the studio where this file begins')
      return mtlxEnvelope(envelope)
    },
  }
}

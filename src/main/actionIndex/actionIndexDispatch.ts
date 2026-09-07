import type { ActionIndex } from './actionIndex'
import type { ActionIndexRequest } from './actionIndexProtocol'

export function dispatchActionIndex(index: ActionIndex, request: ActionIndexRequest): unknown {
  switch (request.op) {
    case 'rebuild':
      return index.rebuild(request.corpus)
    case 'writeEmbeddings':
      return index.writeEmbeddings(request.embeddings)
    case 'search':
      return index.search(request.search)
    case 'inspect':
      return index.inspect(request.search)
    case 'fingerprint':
      return index.fingerprint()
    case 'embeddingModel':
      return index.embeddingModel()
    case 'count':
      return index.count()
    case 'close':
      return index.close()
  }
}

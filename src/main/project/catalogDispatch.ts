import type { Catalog } from './catalog'
import type { CatalogOp, CatalogRequest, CatalogResponse, CatalogResults } from './catalogProtocol'
import { messageOf } from '@shared/guards'

/**
 * One request, run against the catalogue. Separate from the worker entry point so it can be
 * tested without a thread: the entry point is then nothing but plumbing.
 *
 * Never throws. A failure travels back as a response, because a message loop that dies leaves
 * the main process holding a promise nobody settles.
 */
export function dispatchCatalogRequest(catalog: Catalog, request: CatalogRequest): CatalogResponse {
  try {
    return { id: request.id, ok: true, value: valueOf(catalog, request) }
  } catch (error) {
    return { id: request.id, ok: false, error: messageOf(error) }
  }
}

function valueOf(catalog: Catalog, request: CatalogRequest): CatalogResults[CatalogOp] {
  switch (request.op) {
    case 'setAnimationPoster':
      return catalog.setAnimationPoster(request)
    case 'add':
      return catalog.add(request.asset)
    case 'find':
      return catalog.find(request.assetId)
    case 'findByHash':
      return catalog.findByHash(request.hash)
    case 'findByRemoteId':
      return catalog.findByRemoteId(request.remoteAssetId)
    case 'search':
      return catalog.search(request.query)
    case 'countByType':
      return catalog.countByType()
    case 'remove':
      return catalog.remove(request.assetId)
    case 'repath':
      return catalog.repath(request.from, request.to)
    case 'forgetUnder':
      return catalog.forgetUnder(request.path)
    case 'assetsUnder':
      return catalog.assetsUnder(request.folders)
    default:
      return journalValueOf(catalog, request)
  }
}

/** The journal's own two, apart because they are the JOURNAL's — the rest of this reads assets. */
function journalValueOf(
  catalog: Catalog,
  request: Extract<CatalogRequest, { op: 'appendActivity' | 'readActivity' }>,
): CatalogResults['appendActivity' | 'readActivity'] {
  return request.op === 'appendActivity'
    ? catalog.appendActivity(request.entries)
    : catalog.readActivity(request.query)
}

import type { MemoryStore } from './memoryStore'
import type { MemoryRequest } from './memoryProtocol'

/**
 * One request, answered by the store. A pure switch, and it never throws on an unknown op: the
 * union is closed, so a new one fails to compile here rather than answering nothing at runtime.
 */
export async function dispatchMemoryRequest(
  store: MemoryStore,
  request: MemoryRequest,
): Promise<unknown> {
  switch (request.op) {
    case 'remember':
      return await store.remember(request.draft)
    case 'amend':
      return await store.amend(request.memoryId, request.patch)
    case 'forget':
      return await store.forget(request.memoryId)
    case 'read':
      return await store.read(request.memoryId)
    case 'list':
      return await store.list(request.query)
    case 'count':
      return await store.count()
    case 'markUsed':
      return await store.markUsed(request.ids)
    case 'rebuild':
      return await store.rebuild()
    case 'refresh':
      return await store.refresh()
    default:
      return dispatchMemoryMaintenance(store, request)
  }
}

type MaintenanceRequest = Exclude<
  MemoryRequest,
  {
    op:
      | 'remember'
      | 'amend'
      | 'forget'
      | 'read'
      | 'list'
      | 'count'
      | 'markUsed'
      | 'rebuild'
      | 'refresh'
  }
>

async function dispatchMemoryMaintenance(
  store: MemoryStore,
  request: MaintenanceRequest,
): Promise<unknown> {
  switch (request.op) {
    case 'compact':
      return await store.compact()
    case 'reset':
      return await store.reset()
    case 'trouble':
      return store.trouble()
    case 'recall':
      return await store.recall(request.ask)
    case 'writeVectors':
      return await store.writeVectors(request.vectors)
    case 'withoutVector':
      return await store.withoutVector(request.model, request.limit)
    case 'pendingVectors':
      return await store.pendingVectors(request.model)
    case 'dropOtherVectors':
      return await store.dropOtherVectors(request.model)
    case 'close':
      return await store.close()
  }
}

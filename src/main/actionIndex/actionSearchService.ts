import { join } from 'node:path'
import { chunk } from '@shared/collections'
import { messageOf } from '@shared/guards'
import { englishText } from '@shared/i18n'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { actionSearchScope } from './actionSearchContext'
import type { Embedder } from '@main/memory/embedder'
import { actionCorpus } from './actionCorpus'
import type { ActionOutcome, ActionResource } from '@shared/domain/assistant'
import type { ActionEmbedding, ActionHit, ActionRanking, ActionSearchScope } from './actionIndex'
import type { AsyncActionIndex } from './actionIndexClient'
import { openActionIndexThread } from './actionIndexThread'

const EMBED_BATCH = 32

const FOUND_LIMIT = 12

/**
 * What `actions.find` answers the model — the hits with their fields, labels in English — built
 * ONCE for the product and the bench: written twice, the two measured different search engines.
 */
export function createActionFinder(deps: {
  search: ActionSearchService['search']
  snapshot: () => Promise<StudioSnapshot | null>
}): (query: unknown) => Promise<ActionOutcome> {
  return async query => {
    if (typeof query !== 'string') return { ok: false, refusal: 'badInput' }
    const scope = actionSearchScope(await deps.snapshot(), query)
    const hits = await deps.search(query, FOUND_LIMIT, undefined, scope)
    return {
      ok: true,
      data: hits.map(hit => ({
        name: hit.action.name,
        description: hit.action.description,
        fields: hit.action.fields.map(field => ({ ...field, label: englishText(field.labelKey) })),
      })),
    }
  }
}

export type ActionSearchService = {
  search: (
    query: string,
    limit?: number,
    available?: readonly ActionResource[],
    scope?: ActionSearchScope,
  ) => Promise<readonly ActionHit[]>
  inspect: (
    query: string,
    limit?: number,
    available?: readonly ActionResource[],
    scope?: ActionSearchScope,
  ) => Promise<readonly ActionRanking[]>
  close: () => Promise<void>
}

export type ActionSearchServiceDeps = {
  userData: string
  embedder: Embedder
  open?: (database: string) => Promise<AsyncActionIndex>
  onTrouble: (message: string) => void
}

export function createActionSearchService({
  userData,
  embedder,
  open = openActionIndexThread,
  onTrouble,
}: ActionSearchServiceDeps): ActionSearchService {
  let opening: Promise<AsyncActionIndex> | null = null
  let indexing: Promise<void> | null = null
  const holder = async (): Promise<AsyncActionIndex> => {
    if (opening) return await opening
    const started = open(join(userData, 'actions.db'))
    opening = started
    try {
      return await started
    } catch (error) {
      if (opening === started) opening = null
      throw error
    }
  }

  const catchUp = async (index: AsyncActionIndex, model: string): Promise<void> => {
    if ((await index.embeddingModel()) === model) return
    const corpus = actionCorpus()
    const embeddings: ActionEmbedding[] = []
    for (const batch of chunk([...corpus.actions], EMBED_BATCH)) {
      if (embedder.chosen() !== model) return
      const vectors = await embedder.embed(batch.map(action => action.searchable))
      if (vectors.length !== batch.length || embedder.chosen() !== model) return
      embeddings.push(
        ...batch.map((action, at) => ({
          name: action.name,
          model,
          values: vectors[at] ?? new Float32Array(),
        })),
      )
    }
    if (embedder.chosen() !== model) return
    await index.writeEmbeddings(embeddings)
  }

  const run = async <Result>(
    query: string,
    limit: number | undefined,
    available: readonly ActionResource[] | undefined,
    scope: ActionSearchScope | undefined,
    failed: Result,
    operation: (
      index: AsyncActionIndex,
      search: Parameters<AsyncActionIndex['search']>[0],
    ) => Promise<Result>,
  ): Promise<Result> => {
    let index: AsyncActionIndex
    try {
      index = await holder()
    } catch (error) {
      onTrouble(messageOf(error))
      return failed
    }
    const model = embedder.chosen()
    if (model !== null) {
      try {
        indexing ??= catchUp(index, model)
        await indexing
        const values = await embedder.embedQuery(query)
        if (values.length > 0 && embedder.chosen() === model)
          return await operation(index, {
            query,
            limit,
            available,
            scope,
            embedding: { model, values },
          })
      } catch (error) {
        onTrouble(messageOf(error))
      } finally {
        indexing = null
      }
    }
    return await operation(index, { query, limit, available, scope })
  }

  return {
    search: async (query, limit, available, scope) =>
      await run(
        query,
        limit,
        available,
        scope,
        [],
        async (index, search) => await index.search(search),
      ),
    inspect: async (query, limit, available, scope) =>
      await run(
        query,
        limit,
        available,
        scope,
        [],
        async (index, search) => await index.inspect(search),
      ),
    close: async () => {
      try {
        await indexing
      } catch {
        // Search already reported this failure; shutdown only waits for the write to settle.
      }
      if (!opening) return
      try {
        await (await opening).close()
      } catch (error) {
        onTrouble(messageOf(error))
      }
    },
  }
}

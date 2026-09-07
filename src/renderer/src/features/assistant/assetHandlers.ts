import { ASSET_TYPES, type AssetChanges, type AssetQuery } from '@shared/domain/asset'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { withBridge, type ActionHandlers } from './actionHandler'
import { boolOf, numberOf, oneOf, textOf, textsOf } from './actionInputs'

/**
 * The library, queried and corrected from outside the window — the other half of `job.waitForCloudGeneration`:
 * the ids a finished generation hands back are looked up here.
 */

function queryOf(input: Record<string, unknown>): AssetQuery {
  const text = textOf(input, 'text')
  const type = oneOf(input, 'type', ASSET_TYPES)
  const tags = textsOf(input, 'tags')
  const limit = numberOf(input, 'limit')
  const offset = numberOf(input, 'offset')

  return {
    ...(text === null ? {} : { text }),
    ...(type ? { type } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    // Only ever asked affirmatively: "everything that was NOT generated" is a question the
    // catalogue does not answer, and `generated: false` would silently mean "no filter".
    ...(boolOf(input, 'generated') ? { generated: true } : {}),
    ...(limit === null ? {} : { limit }),
    ...(offset === null ? {} : { offset }),
  }
}

function update(input: Record<string, unknown>): Promise<ActionOutcome> {
  const name = textOf(input, 'name')
  const type = oneOf(input, 'type', ASSET_TYPES)
  const changes: AssetChanges = {
    ...(name === null ? {} : { name }),
    // Present-but-empty is a real instruction — tags are replaced wholesale — so the key is read
    // rather than the list: `[]` clears them, absent leaves them.
    ...(input.tags === undefined ? {} : { tags: textsOf(input, 'tags') }),
    ...(type ? { type } : {}),
  }

  if (Object.keys(changes).length === 0)
    return Promise.resolve(
      refused(
        'badInput',
        `this call named nothing to change — it writes "name", "tags" or "type", and "type" wants one of: ${ASSET_TYPES.join(', ')}`,
      ),
    )
  return withBridge(bridge => bridge.assets.update(textOf(input, 'assetId') ?? '', changes))
}

/**
 * 🛑 A search that matched nothing answers WHAT THE PROJECT HOLDS, by kind.
 *
 * Measured on the bench pass of 2026-08-26: 35 requests died on « je ne trouve pas ». A bare
 * empty list is a dead end — the counts say whether to look again with another word, or to tell
 * the person the project has none of it.
 */
async function searchAssets(input: Record<string, unknown>): Promise<ActionOutcome> {
  const found = await withBridge(bridge => bridge.assets.search(queryOf(input)))
  if (!found.ok || (Array.isArray(found.data) && found.data.length > 0)) return found

  const counts = await withBridge(bridge => bridge.assets.counts())
  return counts.ok ? { ok: true, data: { found: [], projectHolds: counts.data } } : found
}

export const ASSET_HANDLERS: ActionHandlers = {
  'assets.searchProjectCatalogue': input => searchAssets(input),
  'assets.counts': () => withBridge(bridge => bridge.assets.counts()),
  'asset.update': update,

  /**
   * Through the catalogue, NOT through `assets.captionImages` — that one is the captioning channel and
   * calls the API. Reading a generation's output must cost nothing.
   */
  'asset.get': input => {
    const ids = textsOf(input, 'assetIds')
    return withBridge(bridge => bridge.assets.search({ ids, limit: ids.length }))
  },

  'assets.removeFromLibrary': input =>
    withBridge(bridge =>
      bridge.assets.remove(textsOf(input, 'assetIds'), boolOf(input, 'alsoRemote')),
    ),

  'assets.captionImages': input =>
    withBridge(bridge => bridge.assets.describe(textsOf(input, 'assetIds'))),

  'assets.listMissing': input =>
    withBridge(bridge => bridge.assets.absent(textsOf(input, 'assetIds'))),

  'asset.extractTextures': input =>
    withBridge(bridge => bridge.assets.extractTextures(textOf(input, 'assetId') ?? '')),

  // `false` says there was no file to show, which is a real answer for a library-only asset
  // rather than a failure — hence `notFound` and not `failed`.
  'asset.reveal': async input => {
    const outcome = await withBridge(bridge => bridge.assets.reveal(textOf(input, 'assetId') ?? ''))
    return outcome.ok && outcome.data === false
      ? refused(
          'notFound',
          `asset "${textOf(input, 'assetId') ?? ''}" has no file on this machine to show — assets.search answers what the library holds, and assets.listMissingProjectAssets says which have no file yet`,
        )
      : outcome
  },
}

import { ASSET_TYPES } from './asset'
import { action, type AssistantAction } from './assistantAction'
import { CLOUD_ORDERS } from './cloudAsset'
import { SYNC_POLICIES } from './sync'

/**
 * The Scenario library on the other side of the wire, as something a program can read and move
 * assets across.
 *
 * `pull` and `push` are the only two of the family that leave the machine, and they are the reason
 * it exists at all: everything else here answers a question. A push turns a local asset into
 * something the account holds for good, which is what `asset` engagement means.
 *
 * Paging is by CURSOR, opaque and straight from the previous answer. There is no total to report:
 * the API gives none, and inventing one would be worse than admitting there is none.
 */

const ASSET_IDS: AssistantAction['fields'][number] = {
  key: 'assetIds',
  kind: 'text',
  labelKey: 'assistant.fields.assetIds',
  required: true,
  repeated: true,
}

export const CLOUD_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'cloud.browseAccountLibrary',
    titleKey: 'assistant.actions.cloudBrowseAccountLibrary.title',
    descriptionKey: 'assistant.actions.cloudBrowseAccountLibrary.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'text', kind: 'text', labelKey: 'assistant.fields.query', required: false },
      {
        key: 'tags',
        kind: 'text',
        labelKey: 'assistant.fields.tags',
        required: false,
        repeated: true,
      },
      {
        key: 'types',
        kind: 'choice',
        labelKey: 'assistant.fields.assetType',
        required: false,
        options: ASSET_TYPES,
        repeated: true,
      },
      { key: 'cursor', kind: 'text', labelKey: 'assistant.fields.cursor', required: false },
      {
        key: 'pageSize',
        kind: 'integer',
        labelKey: 'assistant.fields.limit',
        required: false,
        min: 1,
      },
      // Offered here and nowhere else in the family: this is the one read that takes words, and
      // a caller searching by words is the one the newest-first default answers badly.
      {
        key: 'order',
        kind: 'choice',
        labelKey: 'assistant.fields.order',
        required: false,
        options: CLOUD_ORDERS,
      },
    ],
  }),
  action({
    /**
     * Answers assets this account does NOT own — the one read of the family that does. Looking
     * pulls nothing: a tile of the feed belongs to somebody else until it is fetched.
     */
    name: 'cloud.explorePublicFeed',
    titleKey: 'assistant.actions.cloudExplorePublicFeed.title',
    descriptionKey: 'assistant.actions.cloudExplorePublicFeed.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'type',
        kind: 'choice',
        labelKey: 'assistant.fields.assetType',
        required: true,
        options: ASSET_TYPES,
      },
      { key: 'cursor', kind: 'text', labelKey: 'assistant.fields.cursor', required: false },
      {
        key: 'pageSize',
        kind: 'integer',
        labelKey: 'assistant.fields.limit',
        required: false,
        min: 1,
      },
    ],
  }),
  action({
    name: 'cloud.findSimilarPublished',
    titleKey: 'assistant.actions.cloudFindSimilarPublished.title',
    descriptionKey: 'assistant.actions.cloudFindSimilarPublished.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: true },
    ],
  }),
  action({
    /**
     * The dry run, and the reason it is published beside the two that move: a client that has to
     * choose between pushing and pulling can ask what each would do before either costs a request.
     */
    name: 'cloud.previewSync',
    titleKey: 'assistant.actions.cloudPreviewSync.title',
    descriptionKey: 'assistant.actions.cloudPreviewSync.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      ASSET_IDS,
      {
        key: 'policy',
        kind: 'choice',
        labelKey: 'assistant.fields.syncPolicy',
        required: true,
        options: SYNC_POLICIES,
      },
    ],
  }),
  action({
    /**
     * `none`, unlike its twin below: bringing bytes down adds files to the project and takes
     * nothing away, which is the same reading `folder.new` and `files.duplicate` get.
     */
    name: 'cloud.pull',
    titleKey: 'assistant.actions.cloudPull.title',
    descriptionKey: 'assistant.actions.cloudPull.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'remoteAssetIds',
        kind: 'text',
        labelKey: 'assistant.fields.assetIds',
        required: true,
        repeated: true,
      },
    ],
  }),
  action({
    /** The one gesture of the family that leaves something behind on the account, for good. */
    name: 'cloud.push',
    titleKey: 'assistant.actions.cloudPush.title',
    descriptionKey: 'assistant.actions.cloudPush.description',
    commitment: 'asset',
    repeatable: true,
    reach: 'mcp',
    fields: [ASSET_IDS],
  }),
]

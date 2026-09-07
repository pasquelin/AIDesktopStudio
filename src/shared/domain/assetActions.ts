import { ASSET_SEARCH_LIMIT_MAX, ASSET_TYPES } from './asset'
import { action, type ActionField, type AssistantAction } from './assistantAction'

const ASSET_IDS: ActionField = {
  key: 'assetIds',
  kind: 'text',
  labelKey: 'assistant.fields.assetIds',
  required: true,
  repeated: true,
}

const TAGS: ActionField = {
  key: 'tags',
  kind: 'text',
  labelKey: 'assistant.fields.tags',
  required: false,
  repeated: true,
}

const KIND: ActionField = {
  key: 'type',
  kind: 'choice',
  labelKey: 'assistant.fields.assetType',
  required: false,
  options: ASSET_TYPES,
}

/**
 * The library, as something a program can query and correct.
 *
 * What a generation produces lands here, so this is the other half of `job.waitForCloudGeneration`: the ids that
 * came back are looked up through `asset.get`, and everything a client wants to say about them
 * — a name, tags, a corrected kind — goes through `asset.update`.
 */
export const ASSET_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'assets.searchProjectCatalogue',
    titleKey: 'assistant.actions.assetsSearchProjectCatalogue.title',
    descriptionKey: 'assistant.actions.assetsSearchProjectCatalogue.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    returns: ['projectAssetCandidates'],
    fields: [
      { key: 'text', kind: 'text', labelKey: 'assistant.fields.query', required: false },
      KIND,
      TAGS,
      {
        key: 'generated',
        kind: 'boolean',
        labelKey: 'assistant.fields.generated',
        required: false,
      },
      {
        key: 'limit',
        kind: 'integer',
        labelKey: 'assistant.fields.limit',
        required: false,
        min: 1,
        // The bound the main process holds this action to: `assets.searchProjectCatalogue` reaches
        // `parseAssetQuery`, which REFUSES past it rather than trimming.
        max: ASSET_SEARCH_LIMIT_MAX,
      },
      {
        key: 'offset',
        kind: 'integer',
        labelKey: 'assistant.fields.offset',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    name: 'assets.counts',
    titleKey: 'assistant.actions.assetsCounts.title',
    descriptionKey: 'assistant.actions.assetsCounts.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'asset.get',
    titleKey: 'assistant.actions.assetGet.title',
    descriptionKey: 'assistant.actions.assetGet.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [ASSET_IDS],
  }),
  action({
    // Tags are replaced wholesale, which the channel decided long before this: `[]` genuinely
    // means "no tags", and an absent field means "leave it alone".
    name: 'asset.update',
    titleKey: 'assistant.actions.assetUpdate.title',
    descriptionKey: 'assistant.actions.assetUpdate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['projectAssetCandidates'],
    fields: [
      {
        key: 'assetId',
        kind: 'text',
        labelKey: 'assistant.fields.assetId',
        required: true,
        reference: 'asset',
      },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: false },
      TAGS,
      KIND,
    ],
  }),
  action({
    name: 'assets.removeFromLibrary',
    titleKey: 'assistant.actions.assetsRemoveFromLibrary.title',
    descriptionKey: 'assistant.actions.assetsRemoveFromLibrary.description',
    commitment: 'files',
    repeatable: true,
    // Reaches the library when `alsoRemote` is set, which nothing on this machine takes back.
    raises: input => (input.alsoRemote === true ? 'remote' : 'files'),
    reach: 'mcp',
    fields: [
      ASSET_IDS,
      {
        key: 'alsoRemote',
        kind: 'boolean',
        labelKey: 'assistant.fields.alsoRemote',
        required: false,
      },
    ],
  }),
  action({
    // Reads what the API sees in a picture and writes it as the asset's name. Only assets the
    // library knows can be described, so a local-only selection comes back as zero.
    name: 'assets.captionImages',
    titleKey: 'assistant.actions.assetsCaptionImages.title',
    descriptionKey: 'assistant.actions.assetsCaptionImages.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['projectAssetCandidates'],
    fields: [ASSET_IDS],
  }),
  action({
    name: 'asset.extractTextures',
    titleKey: 'assistant.actions.assetExtractTextures.title',
    descriptionKey: 'assistant.actions.assetExtractTextures.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['projectAssetCandidates'],
    fields: [
      {
        key: 'assetId',
        kind: 'text',
        labelKey: 'assistant.fields.assetId',
        required: true,
        reference: 'asset',
      },
    ],
  }),
  action({
    name: 'asset.reveal',
    titleKey: 'assistant.actions.assetReveal.title',
    descriptionKey: 'assistant.actions.assetReveal.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: true },
    ],
  }),
  action({
    name: 'assets.listMissing',
    titleKey: 'assistant.actions.assetsListMissing.title',
    descriptionKey: 'assistant.actions.assetsListMissing.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [ASSET_IDS],
  }),
]

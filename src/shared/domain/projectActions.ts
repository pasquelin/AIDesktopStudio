import { action, NODE_ID, type ActionField, type AssistantAction } from './assistantAction'
import { CLIP_SOURCES } from './scene'

const PATH: ActionField = {
  key: 'path',
  kind: 'text',
  labelKey: 'assistant.fields.filePath',
  required: true,
}

export const PROJECT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'inputMaps.list',
    titleKey: 'assistant.actions.inputMapsList.title',
    descriptionKey: 'assistant.actions.inputMapsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [],
  }),
  action({
    name: 'inputMap.read',
    titleKey: 'assistant.actions.inputMapRead.title',
    descriptionKey: 'assistant.actions.inputMapRead.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [PATH],
  }),
  action({
    name: 'inputMap.write',
    titleKey: 'assistant.actions.inputMapWrite.title',
    descriptionKey: 'assistant.actions.inputMapWrite.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [
      PATH,
      { key: 'map', kind: 'record', labelKey: 'assistant.fields.inputMap', required: true },
    ],
  }),
  action({
    name: 'animationGraphs.list',
    titleKey: 'assistant.actions.animationGraphsList.title',
    descriptionKey: 'assistant.actions.animationGraphsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [],
  }),
  action({
    name: 'animationGraph.read',
    titleKey: 'assistant.actions.animationGraphRead.title',
    descriptionKey: 'assistant.actions.animationGraphRead.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [PATH],
  }),
  action({
    name: 'animationGraph.write',
    titleKey: 'assistant.actions.animationGraphWrite.title',
    descriptionKey: 'assistant.actions.animationGraphWrite.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['project'] },
    fields: [
      PATH,
      { key: 'graph', kind: 'record', labelKey: 'assistant.fields.animationGraph', required: true },
    ],
  }),
  action({
    name: 'animation.retargetStatus',
    titleKey: 'assistant.actions.animationRetargetStatus.title',
    descriptionKey: 'assistant.actions.animationRetargetStatus.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['node'] },
    fields: [
      NODE_ID,
      {
        key: 'source',
        kind: 'choice',
        labelKey: 'assistant.fields.clipSource',
        required: true,
        options: CLIP_SOURCES,
      },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.clipName', required: true },
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: false },
    ],
  }),
]

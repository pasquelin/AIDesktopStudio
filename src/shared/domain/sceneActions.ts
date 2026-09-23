import { action, type ActionField, type ActionName, type AssistantAction } from './assistantAction'
import { OPTIMIZATION_MODES } from './scene'
import { SCENE_NODE_ACTIONS } from './sceneNodeActions'
import { SCENE_MODEL_ACTIONS } from './sceneModelActions'
import { SCENE_WORLD_ACTIONS } from './sceneWorldActions'

export const SCENE_ACTIONS: readonly AssistantAction[] = [
  ...SCENE_NODE_ACTIONS,
  ...optimizationActions(),
  ...SCENE_MODEL_ACTIONS,
  ...SCENE_WORLD_ACTIONS,
]

function optimizationActions(): AssistantAction[] {
  const simple = (
    [
      ['optimization.selection', 'optimizationSelection'],
      ['optimization.world', 'optimizationWorld'],
      ['optimization.clearCache', 'optimizationClearCache'],
    ] satisfies readonly (readonly [ActionName, string])[]
  ).map(([name, key]) => optimizationAction(name, key, []))
  const nodeIds: ActionField = {
    key: 'nodeIds',
    kind: 'text',
    labelKey: 'assistant.fields.nodeIds',
    required: false,
    repeated: true,
  }
  // The two that READ the mounted engine, which is handed the scene one render after the store:
  // they answer once it carries the edit, so the two seconds of a reading call would cut them.
  return [
    {
      ...optimizationAction('optimization.analyze', 'optimizationAnalyze', [nodeIds]),
      awaitsItsEffect: true,
    },
    {
      ...optimizationAction('optimization.report', 'optimizationReport', [nodeIds]),
      awaitsItsEffect: true,
    },
    ...simple,
    optimizationAction('optimization.exclude', 'optimizationExclude', [
      { ...nodeIds, required: true },
    ]),
    optimizationAction('optimization.setMode', 'optimizationSetMode', [
      { ...nodeIds, required: true },
      {
        key: 'mode',
        kind: 'choice',
        labelKey: 'assistant.fields.optimizationMode',
        required: true,
        options: OPTIMIZATION_MODES,
      },
    ]),
  ]
}

function optimizationAction(
  name: ActionName,
  key: string,
  fields: AssistantAction['fields'],
): AssistantAction {
  return action({
    name,
    titleKey: `assistant.actions.${key}.title`,
    descriptionKey: `assistant.actions.${key}.description`,
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields,
  })
}

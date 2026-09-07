import { SCENE_TEMPLATE_IDS } from './sceneTemplate'
import { action, type ActionCommitment, type AssistantAction } from './assistantAction'
import { COMMAND_REGISTRY, type CommandId } from './command'
import { LANDING_TARGETS } from './landingTarget'
import { MODEL_FAMILIES } from './model'
import { allRoles } from './aiRole'
import { CHOICE_SCOPES } from './aiOverview'
import { WORKSPACE_IDS } from './workspace'

const AI_MANAGEMENT_OPERATIONS = [
  'choose',
  'install',
  'cancelInstall',
  'remove',
  'load',
  'cancelLoad',
  'unload',
  'readEngine',
  'installEngine',
  'cancelEngineInstall',
  'installRuntime',
  'cancelRuntimeInstall',
]

/**
 * The commands that upload a picture before they prepare anything.
 *
 * Not the same list as "the AI edits": `prepareEdit` prepares and stops, and nothing is billed
 * until the user submits. What it does do, every time, is flatten the canvas and upload it —
 * a permanent asset in the user's library, which is what earns the yes.
 */
const UPLOADING_COMMANDS: readonly CommandId[] = [
  'canvas.regenerate',
  'canvas.cutout',
  'canvas.enlarge',
  'canvas.vectorize',
  'canvas.extend',
]

/**
 * What a command engages — the one level in the registry derived rather than declared, and so
 * the one guarded command by command: a miss here is a permanent asset created without a yes,
 * and nothing downstream would catch it.
 */
export function commitmentOfCommand(id: string): ActionCommitment {
  // A `string` for the same reason `commandDescriptor` takes one: what asks holds a name, not a
  // narrowed id. An id nothing declares rates as `none`, the level of a call refused anyway.
  return UPLOADING_COMMANDS.some(uploading => uploading === id) ? 'asset' : 'none'
}

/**
 * What a spoken request needs, and the only family reaching `both` doors in full.
 *
 * These eleven are the vocabulary of "open a 3D file", "find me a stone texture" — short, few,
 * and worth the room they take in the assistant's prompt. Every other family is driven by a
 * program that read `tools/list`, and reaches `mcp` alone.
 */
export const CORE_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'ai.localState',
    titleKey: 'assistant.actions.aiLocalState.title',
    descriptionKey: 'assistant.actions.aiLocalState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'ai.manageLocalRuntime',
    titleKey: 'assistant.actions.aiManageLocalRuntime.title',
    descriptionKey: 'assistant.actions.aiManageLocalRuntime.description',
    commitment: 'none',
    raises: input => (input.operation === 'readEngine' ? 'none' : 'studio'),
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'operation',
        kind: 'choice',
        labelKey: 'assistant.fields.aiOperation',
        required: true,
        options: AI_MANAGEMENT_OPERATIONS,
      },
      {
        key: 'localId',
        kind: 'text',
        labelKey: 'assistant.fields.localId',
        required: false,
      },
      {
        key: 'role',
        kind: 'choice',
        labelKey: 'assistant.fields.aiRole',
        required: false,
        options: allRoles(),
      },
      {
        key: 'scope',
        kind: 'choice',
        labelKey: 'assistant.fields.aiScope',
        required: false,
        options: CHOICE_SCOPES,
      },
      {
        key: 'profile',
        kind: 'choice',
        labelKey: 'assistant.fields.aiProfile',
        required: false,
        options: ['motion'],
      },
    ],
  }),
  action({
    name: 'command.runStudioCommand',
    titleKey: 'assistant.actions.commandRunStudioCommand.title',
    descriptionKey: 'assistant.actions.commandRunStudioCommand.description',
    commitment: 'none',
    /**
     * 🛑 A command answers `ok` and NOTHING of what it did, so a model with no way to confirm sends
     * it again: « duplique-le » ran `scene.duplicate` three times and left four cubes where two
     * were asked for. `alreadySettled` refuses the second identical one of a turn, and says the
     * first has already happened — a command meant twice is two turns, or two different ids.
     */
    repeatable: false,
    raises: input =>
      typeof input.command === 'string' ? commitmentOfCommand(input.command) : 'none',
    reach: 'both',
    fields: [
      {
        key: 'command',
        kind: 'choice',
        labelKey: 'assistant.fields.command',
        required: true,
        /**
         * 🛑 The WHOLE registry, the six that raise a dialogue only a person can fill included —
         * five native pickers and `app.new`, which opens a window of the studio's own. Leaving
         * them out was tried and is worse: `options` is what the validator holds an input to, so
         * `command.runStudioCommand project.new` came back `badInput` quoting the 126 remaining
         * names, where the handler answers `nativeDialog` and says what to use instead.
         */
        options: COMMAND_REGISTRY.map(descriptor => descriptor.id),
      },
    ],
  }),
  action({
    name: 'workspace.open',
    titleKey: 'assistant.actions.workspaceOpen.title',
    descriptionKey: 'assistant.actions.workspaceOpen.description',
    commitment: 'none',
    repeatable: true,
    asksItself: true,
    reach: 'both',
    fields: [
      {
        key: 'workspace',
        kind: 'choice',
        labelKey: 'assistant.fields.workspace',
        required: true,
        options: WORKSPACE_IDS,
      },
      {
        key: 'createDocument',
        kind: 'boolean',
        labelKey: 'assistant.fields.createDocument',
        required: false,
      },
      // Naming it here is what lets a caller outside the window finish the gesture: unnamed, the
      // creation puts a field on screen that only a person can fill, and the call waits it out.
      { key: 'title', kind: 'text', labelKey: 'assistant.fields.title', required: false },
      { key: 'folder', kind: 'text', labelKey: 'assistant.fields.folderPath', required: false },
      // What a scene opens on. Read only when a title was given: with none the window opens, and
      // the person in front of it picks the template themselves. Enumerated since 2026-09-06: a
      // client that was not told `empty` existed emptied a new scene by hand, five objects.
      {
        key: 'template',
        kind: 'choice',
        labelKey: 'assistant.fields.template',
        required: false,
        options: SCENE_TEMPLATE_IDS,
      },
    ],
  }),
  action({
    name: 'models.search',
    titleKey: 'assistant.actions.modelsSearch.title',
    descriptionKey: 'assistant.actions.modelsSearch.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    returns: ['generationModelCandidates'],
    fields: [
      { key: 'query', kind: 'text', labelKey: 'assistant.fields.query', required: false },
      {
        key: 'family',
        kind: 'choice',
        labelKey: 'assistant.fields.family',
        required: false,
        options: MODEL_FAMILIES,
      },
      { key: 'operation', kind: 'text', labelKey: 'assistant.fields.operation', required: false },
    ],
  }),
  action({
    name: 'models.select',
    titleKey: 'assistant.actions.modelsSelect.title',
    descriptionKey: 'assistant.actions.modelsSelect.description',
    commitment: 'none',
    repeatable: false,
    reach: 'both',
    inputs: ['generationModelCandidates'],
    fields: [
      {
        key: 'family',
        kind: 'choice',
        labelKey: 'assistant.fields.family',
        required: true,
        options: MODEL_FAMILIES,
      },
      {
        key: 'modelId',
        kind: 'text',
        labelKey: 'assistant.fields.modelId',
        required: true,
        reference: 'model',
      },
    ],
  }),
  action({
    name: 'generator.prepare',
    titleKey: 'assistant.actions.generatorPrepare.title',
    descriptionKey: 'assistant.actions.generatorPrepare.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    inputs: ['generationModelCandidates'],
    produces: ['preparedGeneration'],
    fields: [
      {
        key: 'family',
        kind: 'choice',
        labelKey: 'assistant.fields.family',
        required: true,
        options: MODEL_FAMILIES,
      },
      {
        key: 'modelId',
        kind: 'text',
        labelKey: 'assistant.fields.modelId',
        required: true,
        reference: 'model',
      },
      /**
       * 🛑 The employment, since a family alone names its FIRST — so `code` armed `txt2code` and
       * a call could never reach `code2code`, which is what « rewrite this script » is.
       *
       * `text` rather than a closed set of the twenty-five: only the named family's own are
       * valid, so nine listings out of ten would be wrong, and the narrow briefing pays 8 000
       * characters for eleven actions. An employment the family does not declare is ignored.
       */
      { key: 'operation', kind: 'text', labelKey: 'assistant.fields.operation', required: false },
      // `raw`, because the shape is the target model's own and is only known once
      // `GET /models/{id}` has answered — which `models.readGenerationModelFields` is there to ask.
      { key: 'parameters', kind: 'raw', labelKey: 'assistant.fields.parameters', required: true },
    ],
  }),
  /**
   * 🛑 `mcp`, not `both`: the brain in the window SEES the panel, where a client outside it has
   * only this to read the destination from before it spends. Out of the short list, never out of
   * reach — and the narrow briefing is 8 000 characters that the catalogue never gives ground on.
   */
  action({
    name: 'generator.readArmedGeneration',
    titleKey: 'assistant.actions.generatorReadArmedGeneration.title',
    descriptionKey: 'assistant.actions.generatorReadArmedGeneration.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'generator.submit',
    titleKey: 'assistant.actions.generatorSubmit.title',
    descriptionKey: 'assistant.actions.generatorSubmit.description',
    commitment: 'credits',
    repeatable: true,
    reach: 'both',
    requires: ['preparedGeneration'],
    fields: [
      {
        key: 'landing',
        kind: 'choice',
        labelKey: 'assistant.fields.landing',
        required: false,
        options: LANDING_TARGETS,
      },
    ],
  }),
  action({
    name: 'jobs.list',
    titleKey: 'assistant.actions.jobsList.title',
    descriptionKey: 'assistant.actions.jobsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [],
  }),
  /**
   * The three the prompt field used to carry as buttons.
   *
   * All `none`, and measured rather than assumed: the three channels behind them answer in one
   * round trip, spend nothing, and produce no job.
   */
  action({
    name: 'prompt.suggest',
    titleKey: 'assistant.actions.promptSuggest.title',
    descriptionKey: 'assistant.actions.promptSuggest.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [
      { key: 'draft', kind: 'longText', labelKey: 'assistant.fields.draft', required: true },
    ],
  }),
  action({
    name: 'prompt.translate',
    titleKey: 'assistant.actions.promptTranslate.title',
    descriptionKey: 'assistant.actions.promptTranslate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [{ key: 'text', kind: 'longText', labelKey: 'assistant.fields.text', required: true }],
  }),
  action({
    // No input: what it reads is the pictures already on the form, which is the only place
    // references exist. Asking the model to name them would have it invent asset ids.
    name: 'prompt.describeStyle',
    titleKey: 'assistant.actions.promptDescribeStyle.title',
    descriptionKey: 'assistant.actions.promptDescribeStyle.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [],
  }),
  /**
   * The one action about the conversation rather than about the studio.
   *
   * The model is told to call this when what it did is now the thing to look at, and to leave it
   * alone when the answer is the words themselves. Last on purpose: it is the last thing a plan
   * does, and the model reads this list in order.
   */
  action({
    name: 'chat.close',
    titleKey: 'assistant.actions.chatClose.title',
    descriptionKey: 'assistant.actions.chatClose.description',
    commitment: 'none',
    repeatable: false,
    reach: 'both',
    fields: [],
  }),
  /**
   * How a model too small to be shown the whole registry asks for the rest of it.
   *
   * The brain answers this one itself and asks again — see `answeredTurn`. It is in the registry
   * all the same, because the two doors read one table: a client that reached `tools/list` has
   * no use for it, but a handler is what keeps the registry and the table exhaustive of each other.
   */
  action({
    name: 'actions.find',
    titleKey: 'assistant.actions.actionsFind.title',
    descriptionKey: 'assistant.actions.actionsFind.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [{ key: 'query', kind: 'text', labelKey: 'assistant.fields.query', required: true }],
  }),
]

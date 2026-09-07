import { TIMELINE_TEMPLATES } from './animation'
import { TEMPLATES_BY_GROUP } from './sceneTemplate'
import { action, NODE_ID, type ActionField, type AssistantAction } from './assistantAction'
import { COMPONENT_TYPES } from './componentRegistry'
import { GEOMETRY_SIMPLIFICATIONS, TEXTURE_COMPRESSIONS, TEXTURE_REDUCTIONS } from './gameExport'

/**
 * What an object DOES while the game runs, driven from outside the window.
 *
 * `reach: 'mcp'` for all three: the briefing the window's own assistant reads is already at its
 * width, and three more entries push it past. The inspector is how the window does this.
 */
const componentTypeField: ActionField = {
  key: 'type',
  kind: 'choice',
  labelKey: 'assistant.fields.componentType',
  required: true,
  options: COMPONENT_TYPES,
}

export const GAME_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'component.attach',
    titleKey: 'assistant.actions.componentAttach.title',
    descriptionKey: 'assistant.actions.componentAttach.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE_ID, componentTypeField],
  }),
  action({
    name: 'component.detach',
    titleKey: 'assistant.actions.componentDetach.title',
    descriptionKey: 'assistant.actions.componentDetach.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE_ID, componentTypeField],
  }),
  action({
    /**
     * One field at a time, and the value travels as TEXT: a component's fields differ by type, so
     * a schema naming them all would describe none of them — and a `raw` parameter is one no
     * client can build from. The handler converts it by the kind the DESCRIPTOR declares.
     */
    name: 'component.setProperties',
    titleKey: 'assistant.actions.componentSetProperties.title',
    descriptionKey: 'assistant.actions.componentSetProperties.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE_ID,
      componentTypeField,
      { key: 'field', kind: 'text', labelKey: 'assistant.fields.componentField', required: true },
      { key: 'value', kind: 'text', labelKey: 'assistant.fields.componentValue', required: true },
    ],
  }),
]

/**
 * A game being PLAYED, driven from outside the window.
 *
 * 🛑 What closes the loop of the plan's § 16.4 — `play.start` → `runtime.errors` → `script.write`
 * → `play.stop` → `play.start`. Four things make it close, and each is a decision:
 * `play.start` answers at once rather than waiting for a frame; `runtime.errors` answers
 * ADDRESSABLE faults, script and line; a script that throws is disarmed rather than stopping the
 * game; and `play.step` runs ONE fixed step, so a reading is taken without racing the clock.
 */
export const PLAY_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'play.start',
    titleKey: 'assistant.actions.playStart.title',
    descriptionKey: 'assistant.actions.playStart.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'play.stop',
    titleKey: 'assistant.actions.playStop.title',
    descriptionKey: 'assistant.actions.playStop.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'play.pause',
    titleKey: 'assistant.actions.playPause.title',
    descriptionKey: 'assistant.actions.playPause.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'play.resume',
    titleKey: 'assistant.actions.playResume.title',
    descriptionKey: 'assistant.actions.playResume.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /** One fixed step, so a reading is taken without racing sixty frames a second. */
    name: 'play.step',
    titleKey: 'assistant.actions.playStep.title',
    descriptionKey: 'assistant.actions.playStep.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'steps', kind: 'integer', labelKey: 'assistant.fields.fixedSteps', required: false },
    ],
  }),
  action({
    /** What a running game GOES TO. Refused when nothing is playing — there is no game to move. */
    name: 'play.loadScene',
    titleKey: 'assistant.actions.playLoadScene.title',
    descriptionKey: 'assistant.actions.playLoadScene.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'scene', kind: 'text', labelKey: 'assistant.fields.sceneToLoad', required: true },
      { key: 'fade', kind: 'number', labelKey: 'assistant.fields.fadeSeconds', required: false },
    ],
  }),
  action({
    name: 'runtime.report',
    titleKey: 'assistant.actions.runtimeReport.title',
    descriptionKey: 'assistant.actions.runtimeReport.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /** 🛑 ADDRESSABLE: the script's reference and the line, which is what a repair needs. */
    name: 'runtime.errors',
    titleKey: 'assistant.actions.runtimeErrors.title',
    descriptionKey: 'assistant.actions.runtimeErrors.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
]

/** The `.ts` files a game runs, read and written from outside the window. */
export const SCRIPT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'script.list',
    titleKey: 'assistant.actions.scriptList.title',
    descriptionKey: 'assistant.actions.scriptList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'script.read',
    titleKey: 'assistant.actions.scriptRead.title',
    descriptionKey: 'assistant.actions.scriptRead.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'path', kind: 'text', labelKey: 'assistant.fields.scriptPath', required: true },
    ],
  }),
  action({
    /**
     * Writes a file of the project, which `commitment: 'file'` is what says: it lands on disk and
     * no undo of the studio takes it back — git does.
     */
    name: 'script.write',
    titleKey: 'assistant.actions.scriptWrite.title',
    descriptionKey: 'assistant.actions.scriptWrite.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'path', kind: 'text', labelKey: 'assistant.fields.scriptPath', required: true },
      {
        key: 'source',
        kind: 'longText',
        labelKey: 'assistant.fields.scriptSource',
        required: true,
      },
    ],
  }),
]

/**
 * The three that keep a model from having to GUESS: what is in front of it, the slice of
 * documentation that answers ONE question, and a lot run as a single undo entry. They are the
 * answer to the tool COUNT — a hundred narrow actions is what they replace.
 */
export const STUDIO_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'studio.describe',
    titleKey: 'assistant.actions.studioDescribe.title',
    descriptionKey: 'assistant.actions.studioDescribe.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'ref', kind: 'text', labelKey: 'assistant.fields.describeRef', required: false },
    ],
  }),
  action({
    /** The same source the editor types against — `studio.d.ts`, sliced by topic. */
    name: 'studio.docs',
    titleKey: 'assistant.actions.studioDocs.title',
    descriptionKey: 'assistant.actions.studioDocs.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { targets: ['component'] },
    fields: [
      { key: 'topic', kind: 'text', labelKey: 'assistant.fields.docsTopic', required: false },
    ],
  }),
  action({
    /**
     * 🛑 ONE undo entry and ONE confirmation for a lot of calls — `composed()` of `history.ts`.
     * The commitment of the lot is the MAXIMUM of the calls', so a batch never engages less than
     * what it holds.
     */
    name: 'studio.batch',
    titleKey: 'assistant.actions.studioBatch.title',
    descriptionKey: 'assistant.actions.studioBatch.description',
    // 🛑 `none` for the LOT, and every call inside asked about on its own terms. Weighing the lot
    // at the worst of what it holds, then asking once, collapsed five independent delegation
    // switches into one — see `runBatch`, which carries the whole reasoning.
    commitment: 'none',
    repeatable: true,
    runsOthers: true,
    reach: 'mcp',
    fields: [
      { key: 'calls', kind: 'longText', labelKey: 'assistant.fields.batchCalls', required: true },
    ],
  }),
]

/** One call of a batch: the action to run and what to run it with. */
export type BatchCall = { action: string; input: Record<string, unknown> }

/** The four lists a game writes into, offered as a closed set rather than typed by hand. */
export const TIMELINE_LISTS: readonly string[] = ['events', 'audio', 'video', 'transitions']

const timelineListField: ActionField = {
  key: 'list',
  kind: 'choice',
  labelKey: 'assistant.fields.timelineList',
  required: true,
  options: TIMELINE_LISTS,
}

/**
 * What a timeline CUES, put there from outside the window.
 *
 * 🛑 ONE action for the four lists rather than four: what changes between them is the shape of
 * the row, and `component.setProperties` already settled that question here — the value travels as TEXT
 * and the handler reads it by what the list declares. Four narrow actions would be four schemas
 * a model has to tell apart before it can ask for anything.
 */
export const TIMELINE_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'timeline.addSceneCue',
    titleKey: 'assistant.actions.timelineAddSceneCue.title',
    descriptionKey: 'assistant.actions.timelineAddSceneCue.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      timelineListField,
      { key: 'at', kind: 'number', labelKey: 'assistant.fields.timelineAt', required: true },
      /** What the row IS: an event's name, an asset's id, a transition's kind. */
      { key: 'what', kind: 'text', labelKey: 'assistant.fields.timelineWhat', required: true },
      {
        key: 'duration',
        kind: 'number',
        labelKey: 'assistant.fields.timelineDuration',
        required: false,
      },
      { key: 'entity', kind: 'text', labelKey: 'assistant.fields.nodeId', required: false },
      /** Where a TRANSITION goes. Read by nothing on the other lists — a sound goes nowhere. */
      { key: 'scene', kind: 'text', labelKey: 'assistant.fields.sceneToLoad', required: false },
    ],
  }),
  action({
    name: 'timeline.removeSceneCue',
    titleKey: 'assistant.actions.timelineRemoveSceneCue.title',
    descriptionKey: 'assistant.actions.timelineRemoveSceneCue.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      timelineListField,
      { key: 'id', kind: 'text', labelKey: 'assistant.fields.timelineRowId', required: true },
    ],
  }),
  action({
    /** 🛑 A filter of VIEW: it decides what the panel offers, never what the engine can do. */
    name: 'timeline.setPanelRows',
    titleKey: 'assistant.actions.timelineSetPanelRows.title',
    descriptionKey: 'assistant.actions.timelineSetPanelRows.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'template',
        kind: 'choice',
        labelKey: 'assistant.fields.timelineTemplate',
        required: true,
        options: TIMELINE_TEMPLATES,
      },
    ],
  }),
]

/**
 * One axis of a position, spelled `positionX` as the rest of the registry spells it: a model
 * that learned the name on another tool would otherwise place every prefab at the origin.
 */
const axisField = (axis: 'X' | 'Y' | 'Z'): ActionField => ({
  key: `position${axis}`,
  kind: 'number',
  labelKey: `assistant.fields.position${axis}`,
  required: false,
})

/**
 * What puts a whole game together in one gesture.
 *
 * 🛑 An ASSEMBLY, never an engine: a template lays down nodes carrying components the runtime
 * already has systems for, and a prefab is a document of the project instanced into the scene.
 * Neither adds a way of playing — that is what keeps them from becoming a second runtime.
 */
export const ASSEMBLY_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'game.applyTemplate',
    titleKey: 'assistant.actions.gameApplyTemplate.title',
    descriptionKey: 'assistant.actions.gameApplyTemplate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'template',
        kind: 'choice',
        labelKey: 'assistant.fields.gameTemplate',
        required: true,
        options: TEMPLATES_BY_GROUP.character,
      },
    ],
  }),
  action({
    /**
     * Names a document of the project as a reusable piece, in `game.json`.
     *
     * 🛑 What fills `game.prefabs`, which `ref.ts` declares as the resolver of a `prefab:` id and
     * which nothing wrote until now — so no such reference could ever resolve.
     */
    name: 'prefab.define',
    titleKey: 'assistant.actions.prefabDefine.title',
    descriptionKey: 'assistant.actions.prefabDefine.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.prefabName', required: true },
      { key: 'document', kind: 'text', labelKey: 'assistant.fields.prefabSource', required: false },
    ],
  }),
  action({
    /** A document of the project, instanced where it is asked for — its nodes, its components. */
    name: 'prefab.instantiate',
    titleKey: 'assistant.actions.prefabInstantiate.title',
    descriptionKey: 'assistant.actions.prefabInstantiate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'prefab', kind: 'text', labelKey: 'assistant.fields.prefabRef', required: true },
      axisField('X'),
      axisField('Y'),
      axisField('Z'),
    ],
  }),
]

/** Writing a game that runs with no studio — the plan's § 19. */
export const EXPORT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'game.export',
    titleKey: 'assistant.actions.gameExport.title',
    descriptionKey: 'assistant.actions.gameExport.description',
    /**
     * 🛑 `none` only while the native picker is what asks. Named a folder, nothing raises a
     * dialog and the yes has to come from somewhere: `files`, like every other write.
     */
    commitment: 'none',
    repeatable: true,
    raises: input => (typeof input.folder === 'string' && input.folder !== '' ? 'files' : 'none'),
    reach: 'mcp',
    fields: [
      { key: 'entryScene', kind: 'text', labelKey: 'assistant.fields.entryScene', required: false },
      { key: 'title', kind: 'text', labelKey: 'assistant.fields.gameTitle', required: false },
      { key: 'folder', kind: 'text', labelKey: 'assistant.fields.exportFolder', required: false },
      {
        key: 'generateLods',
        kind: 'boolean',
        labelKey: 'assistant.fields.generateLods',
        required: false,
      },
      {
        key: 'geometrySimplification',
        kind: 'choice',
        labelKey: 'assistant.fields.geometrySimplification',
        required: false,
        options: GEOMETRY_SIMPLIFICATIONS,
      },
      {
        key: 'textureCompression',
        kind: 'choice',
        labelKey: 'assistant.fields.textureCompression',
        required: false,
        options: TEXTURE_COMPRESSIONS,
      },
      {
        key: 'textureReduction',
        kind: 'choice',
        labelKey: 'assistant.fields.textureReduction',
        required: false,
        options: TEXTURE_REDUCTIONS,
      },
    ],
  }),
]

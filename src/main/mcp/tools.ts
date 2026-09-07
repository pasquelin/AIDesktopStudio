import {
  actionsReaching,
  needsConfirmation,
  type ActionCommitment,
  type ActionField,
  type ActionName,
  type AssistantAction,
  assistantAction,
} from '@shared/domain/assistant'
import type { FieldKind } from '@shared/domain/model'
import { englishText } from '@shared/i18n'

/**
 * `ACTION_REGISTRY`, published as MCP tools.
 *
 * The registry has one definition and two readers — the assistant inside the window, which
 * lists it to its model as a vocabulary, and this, which lists it to whatever client connects.
 * Nothing here decides what the studio can do; it only says it in the other dialect.
 */

/** The subset of JSON Schema an action's inputs need. Written out rather than pulled in. */
export type JsonSchema = {
  type: 'object'
  properties: Record<string, FieldSchema>
  required: string[]
  additionalProperties: false
}

type ScalarSchema = {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'object'
  description: string
  enum?: Array<string | number | boolean>
  /** The keys a `record` accepts. `enum` would close the VALUE, which is not what is known. */
  propertyNames?: { enum: string[] }
  minimum?: number
  maximum?: number
}

type FieldSchema = ScalarSchema | { type: 'array'; description: string; items: ScalarSchema }

/**
 * What each of our kinds is in JSON Schema.
 *
 * `raw` is the one with no type at all, and deliberately: it carries a generation model's own
 * parameters, whose shape is only known once `GET /models/{id}` has answered. Announcing it as
 * an object would be a promise the registry cannot keep — it may legitimately be a string.
 * `record` is the case that was wrongly wearing `raw`: an object whose keys this repository knows.
 */
const JSON_TYPE: Record<FieldKind, ScalarSchema['type']> = {
  text: 'string',
  longText: 'string',
  choice: undefined,
  color: 'string',
  image: 'string',
  mesh: 'string',
  task: 'string',
  number: 'number',
  integer: 'integer',
  seed: 'integer',
  boolean: 'boolean',
  raw: undefined,
  record: 'object',
}

function scalarSchema(field: ActionField): ScalarSchema {
  const type = field.kind === 'choice' ? choiceType(field) : JSON_TYPE[field.kind]

  // A `record`'s options name its KEYS, not the values it may hold — the same list, read on the
  // other side of the colon.
  const closed = field.options
    ? field.kind === 'record'
      ? {
          propertyNames: {
            enum: field.options.filter((option): option is string => typeof option === 'string'),
          },
        }
      : { enum: [...field.options] }
    : {}

  return {
    ...(type ? { type } : {}),
    description: englishText(field.labelKey),
    ...closed,
    ...boundsOf(field, type),
  }
}

function choiceType(field: ActionField): ScalarSchema['type'] {
  const types = new Set(field.options?.map(option => typeof option) ?? [])
  if (types.size !== 1) return undefined
  const type = [...types][0]
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  return type === 'string' ? 'string' : undefined
}

/**
 * 🛑 `minimum`/`maximum` are NUMERIC keywords: emitted on a `{type: 'string'}` they are ignored by
 * every validator, so the contract announced a bound nobody applied. A string is bounded by
 * `maxLength`, and `min`/`max` on a text field mean a length — that is what `fits` reads too.
 */
function boundsOf(field: ActionField, type: string | undefined): Record<string, number> {
  const bounded =
    type === 'string' ? { min: 'minLength', max: 'maxLength' } : { min: 'minimum', max: 'maximum' }

  return {
    ...(field.min === undefined ? {} : { [bounded.min]: field.min }),
    ...(field.max === undefined ? {} : { [bounded.max]: field.max }),
  }
}

function fieldSchema(field: ActionField): FieldSchema {
  const scalar = scalarSchema(field)
  if (!field.repeated) return scalar

  return { type: 'array', description: scalar.description, items: scalar }
}

export function schemaOfFields(fields: readonly ActionField[]): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map(field => [field.key, fieldSchema(field)])),
    required: fields.filter(field => field.required).map(field => field.key),
    // Closed on purpose: a client that invents a key is a client whose call would be validated
    // against the registry and refused anyway, and saying so in the schema saves the round trip.
    additionalProperties: false,
  }
}

/**
 * What the client is told an action engages, appended to its own description.
 *
 * 🛑 It says what THIS door does, which is no longer what the window does: a client is refused
 * with a consent token, never shown a modal it cannot see. Saying "asks the person on screen"
 * described a wait that never comes.
 */
const COMMITMENT_NOTE: Record<ActionCommitment, string> = {
  none: 'Runs straight away.',
  files: 'Refuses with a consent token first: it changes files in the project folder.',
  asset: 'Refuses with a consent token first: it uploads an image that stays in the library.',
  remote:
    'Refuses with a consent token first: it publishes to a server, and nothing here undoes that.',
  studio:
    'Refuses with a consent token first, and no setting ever waives that: it changes the ' +
    'settings, the account that answers, or the project that is open.',
  // Not « creative units »: what a run costs is the unit of whichever cloud serves it, and one
  // of them sells credits. The estimate carries no unit either — some services publish none.
  credits: 'Refuses with a consent token first, with an estimate where there is one: it spends.',
}

// The three ways `commitment` alone lies. `raises` lifts the floor from the input; `asksItself`
// marks a handler that raises the studio's own question; `runsOthers` marks one that engages
// nothing of its own and carries calls that do. Read alone, `commitment` sent all three out as
// "Runs straight away".
const OVERRIDE_NOTE = {
  asksItself:
    'Some calls wait on the person at the screen: the studio raises its own question rather than a confirmation.',
  raises:
    'What one call engages depends on what is given: it may be refused with a consent token first.',
  runsOthers:
    'It engages nothing of its own, and every call it carries is cleared on its own terms: one ' +
    'of them needing a consent token refuses the whole lot, having run none of it.',
}

function noteOf(action: AssistantAction): string {
  if (action.runsOthers) return OVERRIDE_NOTE.runsOthers
  if (action.asksItself) return OVERRIDE_NOTE.asksItself
  if (action.raises) return OVERRIDE_NOTE.raises

  return COMMITMENT_NOTE[action.commitment]
}

export type McpTool = {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
}

/**
 * The tool name for an action.
 *
 * The dot has to go: an action is `command.runStudioCommand` here, and the tool-name grammar clients hold us
 * to accepts letters, digits, underscore and dash only. One substitution, reversed by
 * `actionOfTool`, rather than a second column in the registry that could drift from the first.
 */
export function toolName(action: ActionName): string {
  return action.replace('.', '_')
}

export function actionOfTool(name: string): AssistantAction | null {
  return assistantAction(name.replace('_', '.'))
}

/**
 * 🛑 Declared, or `additionalProperties: false` makes the way through unusable by a strict client.
 *
 * On the 40 that can engage and no others — measured 2026-08-29, `raises` included: an action
 * whose floor rises from its input engages without saying so in its `commitment`.
 */
const CONSENT_FIELD: ActionField = {
  key: 'consent',
  kind: 'text',
  labelKey: 'assistant.fields.consent',
  required: false,
}

const canEngage = (action: AssistantAction): boolean =>
  needsConfirmation(action.commitment) || action.raises !== undefined

function toolOf(action: AssistantAction): McpTool {
  return {
    name: toolName(action.name),
    title: englishText(action.titleKey),
    description: `${englishText(action.descriptionKey)} ${noteOf(action)}`,
    inputSchema: schemaOfFields(
      canEngage(action) ? [...action.fields, CONSENT_FIELD] : action.fields,
    ),
  }
}

/**
 * The catalogue, built once.
 *
 * The registry is a module constant and so is the English bundle it reads, so every `tools/list`
 * was rebuilding the same objects — a split-and-reduce over the bundle per action and per field.
 */
const TOOLS: readonly McpTool[] = actionsReaching('mcp').map(toolOf)

export function mcpTools(): readonly McpTool[] {
  return TOOLS
}

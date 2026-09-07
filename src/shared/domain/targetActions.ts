import { action, type AssistantAction } from './assistantAction'

/**
 * Aiming, and nothing else — the one action of the open document that reaches `both` doors.
 *
 * ONE action for six spaces, and that is the whole point: the twenty `canvas.*` entries are
 * `mcp` because the spoken catalogue cannot hold them (`instruction.ts` measures the room), so a
 * person could not say "the sky layer" to the assistant at all. What the target IS stays with
 * the space; what reaches the model is a list of ids it may name.
 */
export const TARGET_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'target.select',
    titleKey: 'assistant.actions.targetSelect.title',
    descriptionKey: 'assistant.actions.targetSelect.description',
    // Aiming is a way of looking, not an edit: nothing is written, and the pick is not undoable
    // because there is nothing to undo.
    commitment: 'none',
    repeatable: false,
    reach: 'both',
    capabilities: { targets: ['layer', 'node', 'clip', 'track'] },
    fields: [{ key: 'aimId', kind: 'text', labelKey: 'assistant.fields.aimId', required: true }],
  }),
]

import { action, type AssistantAction } from './assistantAction'
import { CONTEXT_BODY_MAX, CONTEXT_TITLE_MAX } from './projectContext'

/**
 * The project's own context, read and written from outside the window.
 *
 * `reach: 'mcp'` for all three, and it is measured rather than timid: the assistant already
 * RECEIVES the context in its briefing, so it has nothing to read — and the preamble had sixty-four
 * characters of room left before this chantier, which three more actions would have swallowed.
 *
 * One dot in each name: `toolName` turns the dot into an underscore and `actionOfTool` turns it
 * back, so a second dot would break the round trip.
 */
export const CONTEXT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'context.readProjectCards',
    titleKey: 'assistant.actions.contextReadProjectCards.title',
    descriptionKey: 'assistant.actions.contextReadProjectCards.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * 🛑 `files` only when it REWRITES a text somebody typed, which is what `raises` is for:
     * adding a card takes nothing away, and turning one off is undone by a click. A studio asked
     * to confirm every card added learns to click Allow without reading.
     */
    name: 'context.writeProjectCard',
    titleKey: 'assistant.actions.contextWriteProjectCard.title',
    descriptionKey: 'assistant.actions.contextWriteProjectCard.description',
    commitment: 'none',
    /**
     * With no `cardId` this WRITES A NEW CARD, so a second identical call spends one of the few
     * the project takes on a twin. Two different cards in one turn still pass: their inputs
     * differ, and so do their keys (2026-09-09).
     */
    repeatable: false,
    raises: input => ('title' in input || 'body' in input ? 'files' : 'none'),
    reach: 'mcp',
    fields: [
      {
        key: 'cardId',
        kind: 'text',
        labelKey: 'assistant.fields.cardId',
        required: false,
      },
      {
        key: 'title',
        kind: 'text',
        labelKey: 'assistant.fields.cardTitle',
        required: false,
        max: CONTEXT_TITLE_MAX,
      },
      {
        key: 'body',
        kind: 'longText',
        labelKey: 'assistant.fields.cardBody',
        required: false,
        max: CONTEXT_BODY_MAX,
      },
      {
        key: 'active',
        kind: 'boolean',
        labelKey: 'assistant.fields.cardActive',
        required: false,
      },
    ],
  }),
  action({
    name: 'context.deleteProjectCard',
    titleKey: 'assistant.actions.contextDeleteProjectCard.title',
    descriptionKey: 'assistant.actions.contextDeleteProjectCard.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    capabilities: {
      targets: ['projectContext'],
      documentAffinity: 'transversal',
    },
    fields: [
      {
        key: 'cardId',
        kind: 'text',
        labelKey: 'assistant.fields.cardId',
        required: true,
      },
    ],
  }),
]

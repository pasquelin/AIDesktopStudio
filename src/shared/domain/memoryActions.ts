import { action, type ActionName, type AssistantAction } from './assistantAction'
import {
  MEMORY_BODY_MAX,
  MEMORY_IMPORTANCE_MAX,
  MEMORY_IMPORTANCE_MIN,
  MEMORY_PAGE,
  MEMORY_SUMMARY_MAX,
  MEMORY_TYPES,
} from './assistantMemory'

/**
 * What the assistant has learned, read and written from outside the window.
 *
 * 🛑 `reach: 'mcp'` for all five, `memory.recall` included, and it is MEASURED rather than timid:
 * the short briefing runs 7 078 characters against `roomFor(4096)` = 7 116, so 38 are left — and
 * the smallest of these blocks is longer than that. At `'both'` it would take an action off the
 * catalogue every 4 096-token model is shown.
 *
 * Nothing is pushed at the assistant: its briefing carries a SIGNAL naming this action, and a
 * narrow door reaches it through `actions.find` — see `memorySignal` in `instruction.ts`.
 */

/**
 * Named here because the briefing signals it by name, and a name spelt twice is a name that
 * drifts — the same reason `DISCOVERY_ACTION` is named rather than written out.
 */
export const MEMORY_RECALL_ACTION: ActionName = 'memory.recall'
export const MEMORY_ACTIONS: readonly AssistantAction[] = [
  action({
    name: MEMORY_RECALL_ACTION,
    titleKey: 'assistant.actions.memoryRecall.title',
    descriptionKey: 'assistant.actions.memoryRecall.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'query', kind: 'text', labelKey: 'assistant.fields.memoryQuery', required: true },
      {
        key: 'limit',
        kind: 'integer',
        labelKey: 'assistant.fields.memoryLimit',
        required: false,
        min: 1,
        max: MEMORY_PAGE,
      },
    ],
  }),
  action({
    name: 'memory.read',
    titleKey: 'assistant.actions.memoryRead.title',
    descriptionKey: 'assistant.actions.memoryRead.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'memoryId', kind: 'text', labelKey: 'assistant.fields.memoryId', required: true },
    ],
  }),
  action({
    /**
     * 🛑 `files` and not a constant `raises`: the plan asked for the latter, but `mcpTools`
     * describes a `raises` as « depends on what is given » — and this one never depends. A read
     * asks nothing, a write into the project's own folder asks, and both are said outright.
     */
    name: 'memory.write',
    titleKey: 'assistant.actions.memoryWrite.title',
    descriptionKey: 'assistant.actions.memoryWrite.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'type',
        kind: 'text',
        labelKey: 'assistant.fields.memoryType',
        required: true,
        options: [...MEMORY_TYPES],
      },
      {
        key: 'summary',
        kind: 'text',
        labelKey: 'assistant.fields.memorySummary',
        required: true,
        max: MEMORY_SUMMARY_MAX,
      },
      {
        key: 'body',
        kind: 'longText',
        labelKey: 'assistant.fields.memoryBody',
        required: false,
        max: MEMORY_BODY_MAX,
      },
      {
        key: 'importance',
        kind: 'integer',
        labelKey: 'assistant.fields.memoryImportance',
        required: false,
        min: MEMORY_IMPORTANCE_MIN,
        max: MEMORY_IMPORTANCE_MAX,
      },
      { key: 'file', kind: 'text', labelKey: 'assistant.fields.memoryFile', required: false },
    ],
  }),
  action({
    name: 'memory.forget',
    titleKey: 'assistant.actions.memoryForget.title',
    descriptionKey: 'assistant.actions.memoryForget.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'memoryId', kind: 'text', labelKey: 'assistant.fields.memoryId', required: true },
    ],
  }),
  action({
    name: 'memory.link',
    titleKey: 'assistant.actions.memoryLink.title',
    descriptionKey: 'assistant.actions.memoryLink.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'memoryId', kind: 'text', labelKey: 'assistant.fields.memoryId', required: true },
      { key: 'toMemoryId', kind: 'text', labelKey: 'assistant.fields.memoryTo', required: true },
    ],
  }),
]

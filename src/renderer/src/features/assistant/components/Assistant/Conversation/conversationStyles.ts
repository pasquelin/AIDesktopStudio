/**
 * A block posted in the conversation column: the confirmation, and the place one writes. They sat
 * one above the other with the same classes and two different radii, which read as two kinds of
 * card where there is one.
 *
 * 🛑 RULED, never filled, as the Git panel rules off the message being written. A surface fill
 * here is the fill of a neutral button, so Stop and No had no edge until the pointer raised them.
 *
 * A sibling module rather than the conversation itself: the conversation imports the question, so
 * the question importing back would close a cycle `import-cycles.test.ts` keeps at zero.
 */
export const CONVERSATION_CARD =
  'border-border flex shrink-0 flex-col gap-2 rounded-(--radius-sc-lg) border p-2'

export const CONVERSATION_ACTIONS =
  'assistant-conversation-actions flex min-w-0 flex-nowrap items-center gap-2'

/**
 * The type and gutters the field and the mirror behind it MUST share: read from two places, the
 * grey tail lands a character off the writing it continues.
 */
export const CONVERSATION_FIELD_TYPE = 'px-1 text-xs'

/**
 * What the PERSON said, on the right: their sentence, and the answer they gave a question.
 * Bounded because a dictated request runs long, and a bubble the width of the thread stops
 * reading as one side of an exchange.
 */
export const CONVERSATION_BUBBLE =
  'bg-surface text-text m-0 max-w-4/5 rounded-(--radius-sc-sm) px-2 py-1 text-xs'

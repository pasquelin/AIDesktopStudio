/**
 * What the assistant asks the PERSON before it does anything — the second half of an answer, and
 * a shape the FORMAT block describes rather than an action of the registry.
 *
 * 🛑 An action is the wrong place for it, and it was measured there: named by a rule that gives
 * ground when the room runs out, `chat.ask` was described to a model that then never called it —
 * it wrote the question in `say` and sent its calls in the same breath. Here it cannot be cut.
 *
 * `choices` may be empty, and that is the ordinary case rather than the edge: "what shall the
 * project be called" has no answers to press, and the person types it into the composer.
 */
export type AssistantAsk = {
  /**
   * 🛑 One is the ordinary case and stays the light one — a single question with no note is
   * answered from the composer, as it always was. A list is a QUESTIONNAIRE, answered in its own
   * card because one typed line cannot say which question it belongs to.
   */
  questions: readonly AskedQuestion[]
}

/** One question of an ask: what is asked, what may be pressed, and whether a note may come with
 * the answer. */
export type AskedQuestion = {
  question: string
  choices: readonly string[]
  /** A free note beside the answer. Absent is the ordinary case. */
  note?: true
  /** Several choices may be kept. The card SAYS which it is: a radio for one, boxes for several. */
  many?: true
}

/**
 * 🛑 Whether the COMPOSER answers this ask, which is the light case and the ordinary one: ONE
 * question with no note, exactly as it was before there were several. Anything more is a form —
 * a line typed below says nothing about which question it belongs to.
 */
export const answeredByComposer = (questions: readonly AskedQuestion[]): boolean =>
  questions.length === 1 && questions[0]?.note !== true && questions[0]?.many !== true

/**
 * 🛑 What one card may hold. Beyond it a reply is REFUSED rather than trimmed: a model told its
 * question went through, having asked eight things and got six, plans against answers it never had.
 */
export const MOST_QUESTIONS = 6

/**
 * What one press leaves behind: the offered order, and one answer alone unless several are let.
 *
 * Beside the type rather than in either card: the chips and the listed rows toggle the same way,
 * and written twice they would answer differently the day the order or the undo moves.
 */
export function answersAfter(
  asked: AskedQuestion,
  held: readonly string[],
  choice: string,
): readonly string[] {
  if (asked.many !== true) return held.includes(choice) ? [] : [choice]

  return asked.choices.filter(one => (one === choice ? !held.includes(one) : held.includes(one)))
}

/** What came back: what was ticked or typed — a LIST even for one — and the note beside it. */
export type AskedAnswer = {
  answers: readonly string[]
  note?: string
}

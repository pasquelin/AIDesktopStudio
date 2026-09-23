/**
 * What the assistant asks the PERSON before it does anything — the second half of an answer, and
 * a shape the FORMAT block describes rather than an action of the registry.
 *
 * 🛑 An action is the wrong place for it, and it was measured there: named by a rule that gives
 * ground when the room runs out, `chat.ask` was described to a model that then never called it —
 * it wrote the question in `say` and sent its calls in the same breath. Here it cannot be cut.
 *
 * `choices` may be empty, and that is the ordinary case rather than the edge: "what shall the
 * project be called" has no answers to press, and the card opens a field for it — the same field
 * a questionnaire gives each of its questions.
 */
export type AssistantAsk = {
  /**
   * 🛑 One question with answers to PRESS stays the light one — pressing settles it, and a line
   * typed below names one of them. Anything else is answered in a card of its own: a list because
   * one typed line cannot say which question it belongs to, and a question with nothing to press
   * because a title is written in a field, as it is everywhere else in the studio.
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
 * 🛑 Whether the COMPOSER answers this ask: ONE question, no note, and answers to PRESS — a line
 * typed below then names one of them.
 *
 * 🛑 A lone question with NOTHING to press is a form now, and that is the whole point: « quel
 * titre ? » used to print "answer below" and leave the person hunting for the composer, where
 * naming a project, a document or a file has a field everywhere else in the studio.
 */
export const answeredByComposer = (questions: readonly AskedQuestion[]): boolean =>
  questions.length === 1 &&
  questions[0]?.note !== true &&
  questions[0]?.many !== true &&
  (questions[0]?.choices.length ?? 0) > 0

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

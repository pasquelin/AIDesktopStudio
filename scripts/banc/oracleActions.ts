import type { ActionName, ActionRefusal } from '@shared/domain/assistant'
import type { Run } from './run'

/** A menu command actually run, matched case-insensitively against the command id. */
export const ranStudioCommand = (run: Run, command: string): boolean =>
  run.called.some(
    one =>
      one.action === 'command.runStudioCommand' &&
      String(one.input['command']).toLowerCase() === command.toLowerCase(),
  )

/** Whether a search was actually run, and on a word the sentence carries. */
export const searched = (run: Run, word: string): boolean =>
  run.called.some(
    one =>
      (one.action === 'files.search' || one.action === 'assets.searchProjectCatalogue') &&
      Object.values(one.input).some(
        value => typeof value === 'string' && value.toLowerCase().includes(word),
      ),
  )

/** The call the person explicitly declined. */
export const declined = (run: Run, name: ActionName): boolean =>
  run.called.some(one => one.action === name && one.answer?.startsWith('refused declined') === true)

/** Whether an action ran at all, refused or not. */
export const tried = (run: Run, name: ActionName): boolean =>
  run.called.some(one => one.action === name)

/** Whether the studio refused that action for the expected reason and corrective detail. */
export const refusedWith = (
  run: Run,
  name: ActionName,
  refusal: ActionRefusal,
  detail?: string,
): boolean => {
  const prefix = `refused ${refusal}`
  return run.called.some(
    one =>
      one.action === name &&
      (detail === undefined
        ? one.answer === prefix || one.answer?.startsWith(`${prefix} (`) === true
        : one.answer?.startsWith(`${prefix} (`) === true && one.answer.includes(detail)),
  )
}

/** The successful answer of one action; refusals are deliberately excluded. */
export const answerOf = (run: Run, name: ActionName): string | null => {
  const held = run.called.find(one => one.action === name)?.answer
  return held === undefined || held.startsWith('refused') ? null : held
}

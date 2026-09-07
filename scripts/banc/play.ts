import type { ActionName } from '@shared/domain/assistant'
import { composedContext } from '@shared/domain/projectContext'
import { resultLine } from '@/features/assistant/components/Assistant/Conversation/conversation'
import { useAssistant } from '@/stores/assistant'
import { PROJECT } from './project'
import type { Called, Run, Scenario } from './run'
import { createStudio, type Think } from './studio'

/**
 * 🛑 `useAssistant.say()` chains the rounds — the window's own loop, so the ceiling, the history
 * window and the stop conditions are the ones the product ships. The bench stands in for the
 * DOOR the main process holds, filling state, context and the memory count as `createRoutedBrain`
 * does — `folders` alone stays out, no scenario naming a folder of this machine.
 */
export async function play(scenario: Scenario, ask: Think): Promise<Run & { rounds: number }> {
  const asked: { action: ActionName; input: Record<string, unknown> }[] = []
  let rounds = 0

  const studio = await createStudio(
    PROJECT,
    async request => {
      rounds += 1
      const answer = await ask({
        ...request,
        state: await studio.state(),
        context: composedContext(studio.shell.context().cards),
        /**
         * 🛑 The COUNT, which is the whole of what a briefing says about the memory — and the bench
         * never sent it, so `MEMORY_CALL` was printed on no run at all. Told nothing, the model
         * searched the FILES for what it had learned: « qu'est-ce que tu sais des caméras ? »
         * answered `files.search query=camera → found 0`, measured 2026-09-01.
         */
        memories: studio.answeringMemories(),
      })

      asked.push(
        ...answer.calls.map(one => ({ action: one.action as ActionName, input: one.input })),
      )
      return answer
    },
    scenario.answers,
  )

  try {
    await scenario.setup?.(studio)
  } catch (error) {
    // The caller closes by the handle this throw takes away, and the ports would stay lent to a
    // run that is over — the next case then fails for the wrong reason.
    studio.close()
    throw error
  }

  // What the decor changed is not what the model changed — see `settle`.
  studio.settle()
  useAssistant.setState({ turns: [], spent: 0 })

  for (const said of scenario.said) await useAssistant.getState().say(said)

  const turns = useAssistant.getState().turns
  const steps = turns.flatMap(one => one.steps)
  /**
   * 🛑 Paired by INDEX and then closed: `ranAll` returns early on a stop and on a throw, so the
   * calls it never reached are in `asked` with no step behind them — zipping two lists would
   * read the wrong answer for every call after the first gap.
   */
  const called: Called[] = asked.map((one, at) => {
    const step = steps[at]
    return step === undefined || step.action !== one.action
      ? one
      : { ...one, answer: answerShown(step) }
  })

  return {
    studio,
    called,
    refused: steps.filter(one => one.refusal !== null).length,
    said: turns.map(one => one.answered).join('\n'),
    asks: turns.flatMap(one => one.asks.map(asked => asked.question)),
    rounds,
  }
}

/**
 * What the studio answered: a refusal by name, or how much came back. The COUNT and not the rows
 * — "found 0" is the whole finding, and nine paths are three lines.
 *
 * 🛑 Bounded by `resultLine` and by NOTHING ELSE — the product's own cut, so an oracle can never
 * pass on what the model was not shown. Cut to 60 here instead, `answerOf` read the ellipsis:
 * `{"ref":"script:Walk.ts","source":"export default defineSc…` against a scenario looking for
 * `defineScript`, unwinnable by any model, measured 2026-08-31.
 */
function answerShown(step: { refusal: string | null; detail?: string; data?: unknown }): string {
  if (step.refusal !== null) {
    return `refused ${step.refusal}${step.detail === undefined ? '' : ` (${step.detail})`}`
  }
  if (Array.isArray(step.data)) return `found ${step.data.length}`

  return step.data === undefined ? 'ok' : `ok ${resultLine(step.data)}`
}

/** What a value was, short enough to read in a failure list. */
export const shortly = (value: unknown): string => {
  const written = typeof value === 'string' ? value : JSON.stringify(value)
  return written.length > 60 ? `${written.slice(0, 57)}…` : written
}

import i18next from 'i18next'
import { writeScopeFor, type RoleRow } from '@shared/domain/aiOverview'
import { ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { useAiModels } from '@/stores/aiModels'
import { useSettings } from '@/stores/settings'
import {
  assistantChoiceLabel,
  assistantChoicesOf,
  providerOfChoice,
  servingChoiceValue,
  type AssistantChoice,
} from './choices'
import { mountedStudioAsk } from './studioAsk'

type Offered = { one: AssistantChoice; label: string; serving: boolean }

/**
 * Every assistant on offer, under the name the picker beside the composer gives it.
 *
 * 🛑 The names are made UNIQUE: an answer comes back as the label that was ticked, and two
 * folders holding one model name are two models — `ownModelId` keys them by path. Repeated, the
 * row could not be told from its twin, and the first of them was armed whichever was ticked.
 */
function offeredAssistants(row: RoleRow): readonly Offered[] {
  const { cloudModels, model } = useSettings.getState().settings.assistant
  const serving = servingChoiceValue(row.provider, model)
  const labels = assistantChoicesOf(row, cloudModels).map(one => ({
    one,
    label: assistantChoiceLabel(one, i18next.t),
  }))

  return labels.map(({ one, label }, at) => ({
    one,
    label: labels.findIndex(other => other.label === label) === at ? label : `${label} (${at + 1})`,
    serving: one.value === serving,
  }))
}

/** Armed at the APPLICATION, model first: the brain reads it on the turn it answers. */
async function armAtApplication(picked: AssistantChoice): Promise<void> {
  // 🛑 `useSettings` and not the assistant store's own `setModel`: this module is reached by the
  // executor, which that store imports — `import-cycles.test.ts` refuses the way back.
  if (picked.group === 'studio') {
    await useSettings.getState().setValue('assistant.model', picked.model)
  }
  await useAiModels.getState().chooseAiProvider(ASSISTANT_ROLE, providerOfChoice(picked), 'app')
}

/**
 * Which assistant the NEW project will work with — asked BEFORE the switch, armed after.
 *
 * 🛑 Asked before, because past the switch the role is served by nothing and the card that would
 * repair it is the one this very assistant has to carry. Asked only where there is something to
 * lose: a choice written at the application already follows every project.
 *
 * Armed after, and only once the project exists: `createAt` still asks about unsaved work and
 * still refuses a folder that holds files, and a creation turned down there used to leave the
 * whole application's assistant changed for nothing.
 *
 * The write goes to the APPLICATION, which is why arming late is safe: no path to know, no order
 * to respect, and the question does not come back at the next project. Let go, nothing is
 * written — the project is made, with no assistant until one is chosen in the settings.
 */
export async function askKeptAssistant(): Promise<(() => Promise<void>) | null> {
  const ask = mountedStudioAsk()
  const overview = useAiModels.getState().overview
  const row = overview?.roles.find(one => one.role === ASSISTANT_ROLE)
  if (!ask || !row || writeScopeFor(row, overview?.projectPath ?? null) !== 'project') return null

  const offered = offeredAssistants(row)
  if (offered.length === 0) return null

  const held = offered.find(one => one.serving)
  const given = await ask(
    [{ question: i18next.t('assistant.keepBrain'), choices: offered.map(one => one.label) }],
    {
      notice: i18next.t('assistant.keepBrainNotice'),
      chosen: [{ answers: held ? [held.label] : [] }],
    },
  )

  const answered = given?.[0]?.answers[0]
  const picked = offered.find(one => one.label === answered)
  if (answered === undefined || picked === undefined) return null

  return () => armAtApplication(picked.one)
}

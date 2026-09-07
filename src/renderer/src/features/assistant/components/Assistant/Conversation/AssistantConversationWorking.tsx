import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/Spinner'
import { useAssistant } from '@/stores/assistant'
import { AssistantConversationMissionEvents } from '@/components/AssistantConversationMissionEvents'

/**
 * IN the thread, last of it — where the answer itself will appear, and never down by the field:
 * what one watches while waiting is the place the words will land.
 *
 * A leaf of its own because it is the ONE part a stream rewrites, once a frame: read by the panel,
 * those three lines rebuilt the whole thread, its composer and its picker at that rate.
 */
export function AssistantConversationWorking() {
  const { t } = useTranslation()
  const busy = useAssistant(state => state.busy)
  const asked = useAssistant(state => state.asked)
  const choosing = useAssistant(state => state.choosing)
  const round = useAssistant(state => state.round)
  const stopping = useAssistant(state => state.stopping)
  const streamed = useAssistant(state => state.streamed)
  const promptTokens = useAssistant(state => state.promptTokens)
  const replyTokens = useAssistant(state => state.replyTokens)

  if (!busy || asked !== null || choosing !== null) return <AssistantConversationMissionEvents />

  return (
    <>
      <AssistantConversationMissionEvents />
      <li className="text-muted text-mini m-0 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <Spinner label={t('assistant.thinking')} size={14} />
          {stopping
            ? t('assistant.stopping')
            : round > 1
              ? t('assistant.workingRound', { round })
              : t('assistant.thinking')}
          {promptTokens > 0 && (
            <span>{t('assistant.tokens', { prompt: promptTokens, reply: replyTokens })}</span>
          )}
        </span>
        {/* The tail and not the head: what says a model is alive is the words arriving, and the top
          of a JSON object stops moving after the first line. */}
        {streamed !== '' && <span className="line-clamp-3 break-all">{streamed}</span>}
      </li>
    </>
  )
}

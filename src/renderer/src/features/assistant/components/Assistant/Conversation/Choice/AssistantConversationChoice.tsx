import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { HINT_TOP } from '@/helpers/tooltip'
import { composerAnswers, useAssistant, type AssistantChoiceQuestion } from '@/stores/assistant'
import { AssistantConversationChoiceForm } from './AssistantConversationChoiceForm'
import { AssistantConversationChoiceList } from './AssistantConversationChoiceList'
import { CONVERSATION_CARD } from '../conversationStyles'

/**
 * What the assistant asked, with the answers it offered — and often none: « quel nom ? » has
 * nothing to press, so the composer below takes the answer and the card says where.
 */
export function AssistantConversationChoice(choosing: AssistantChoiceQuestion) {
  const { questions, opening } = choosing
  const { t } = useTranslation()
  const choose = useAssistant(state => state.choose)
  const named = useId()
  const only = questions[0]

  // Anything the composer cannot answer is a form: a line typed below says nothing about which
  // question it belongs to. A question the STUDIO opens ticked is one too — answering on the
  // first tick would settle it before the row already ticked could be left alone.
  if (!only || !composerAnswers(choosing)) {
    return <AssistantConversationChoiceForm questions={questions} opening={opening} />
  }

  return (
    <div className={CONVERSATION_CARD}>
      <p className="text-text m-0 text-xs font-medium">{only.question}</p>

      {only.choices.length === 0 && (
        <p className="text-muted text-mini m-0">{t('assistant.answerBelow')}</p>
      )}

      {/* Ticking answers on the spot: one question, one answer, nothing to send. */}
      {only.choices.length > 0 && (
        <AssistantConversationChoiceList
          asked={only}
          chosen={[]}
          onChange={chosen => choose([{ answers: chosen }])}
          named={named}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Dismissing is an ANSWER, and the only one that spends nothing: the chain reads it as
            declined and stops rather than picking for the person. */}
        <Button onClick={() => choose(null)} {...HINT_TOP(t('assistant.skipChoiceHint'))}>
          {t('assistant.skipChoice')}
        </Button>
      </div>
    </div>
  )
}

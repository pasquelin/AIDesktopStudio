import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AskedAnswer, AskedQuestion } from '@shared/domain/assistantAsk'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { HINT_TOP } from '@/helpers/tooltip'
import { useAssistant, type AssistantChoiceQuestion } from '@/stores/assistant'
import { AssistantConversationChoiceList } from './AssistantConversationChoiceList'
import { CONVERSATION_CARD } from '../conversationStyles'

/**
 * Several questions in one breath, each answered on its own line and all handed back together.
 *
 * 🛑 The draft lives here, so the card is KEYED on the ask it draws: unkeyed, the queue rotating
 * reuses this instance and the next questionnaire opens on the previous one's answers.
 */
export function AssistantConversationChoiceForm({
  questions,
  opening,
}: {
  questions: readonly AskedQuestion[]
  opening?: AssistantChoiceQuestion['opening']
}) {
  const { t } = useTranslation()
  const choose = useAssistant(state => state.choose)
  // 🛑 Six fields all named « Réponse » say nothing about WHICH question they answer: the group
  // carries the question, which is what a reader is told before the field it holds.
  const named = useId()
  const [given, setGiven] = useState<readonly AskedAnswer[]>(
    () => opening?.chosen ?? questions.map(() => ({ answers: [] })),
  )

  const write = (at: number, written: Partial<AskedAnswer>): void => {
    setGiven(held => held.map((one, index) => (index === at ? { ...one, ...written } : one)))
  }

  return (
    <div className={CONVERSATION_CARD}>
      {/* What declining COSTS, said where the answer is given rather than after the fact. */}
      {opening && <p className="alert alert-info alert-soft m-0 text-xs">{opening.notice}</p>}

      {questions.map((one, at) => (
        <div
          key={`${at}-${one.question}`}
          role="group"
          aria-labelledby={`${named}-${at}`}
          className="flex flex-col gap-2"
        >
          <p id={`${named}-${at}`} className="text-text m-0 text-xs font-medium">
            {one.question}
          </p>

          {one.choices.length === 0 ? (
            <TextField
              label={t('assistant.answerLabel')}
              scId={`assistant.answer.${at}`}
              value={given[at]?.answers[0] ?? ''}
              onChange={answer => write(at, { answers: answer === '' ? [] : [answer] })}
            />
          ) : (
            <AssistantConversationChoiceList
              asked={one}
              chosen={given[at]?.answers ?? []}
              onChange={answers => write(at, { answers })}
              named={`${named}-${at}`}
            />
          )}

          {one.note === true && (
            <TextField
              label={t('assistant.noteLabel')}
              scId={`assistant.note.${at}`}
              value={given[at]?.note ?? ''}
              onChange={note => write(at, { note })}
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => choose(given)}
          {...HINT_TOP(t('assistant.sendAnswersHint'))}
        >
          {t('assistant.sendAnswers')}
        </Button>
        {/* Dismissing is an ANSWER, and the only one that spends nothing: the chain reads it as
            declined and stops rather than picking for the person. */}
        <Button onClick={() => choose(null)} {...HINT_TOP(t('assistant.skipChoiceHint'))}>
          {t('assistant.skipChoice')}
        </Button>
      </div>
    </div>
  )
}

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AssistantTurn } from './conversation'
import { AssistantConversationStep } from './AssistantConversationStep'
import { CONVERSATION_BUBBLE } from './conversationStyles'

/**
 * One exchange: what was asked, what came back, and what each action actually did.
 *
 * Memoised because a stream writes once a FRAME and a keystroke once a character, neither of
 * which touches a turn: a thread of forty was rebuilt forty times over for a word it never shows.
 */
export const AssistantConversationTurn = memo(function AssistantConversationTurn({
  turn,
}: {
  turn: AssistantTurn
}) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-col gap-2">
      {/* On the right — the side a chat has always put what one said. */}
      <div className="flex justify-end">
        <p className={CONVERSATION_BUBBLE}>{turn.said}</p>
      </div>

      {/* What came back carries no bubble, and the asymmetry is the point: one side of this
          conversation is a request and the other is the studio answering for itself. Bubbles on
          both sides read as two people talking, which is not what this is. */}
      {turn.answered !== '' && <p className="text-text m-0 text-xs">{turn.answered}</p>}

      {turn.steps.map((step, index) => (
        // Keyed by position: the same action can legitimately run twice in one plan, and the
        // list only ever grows to the end.
        <AssistantConversationStep key={index} step={step} />
      ))}

      {/* Once the card that asked is gone: the question drew the whole turn to a halt, and a
          thread keeping no trace of it reads as an answer given for no reason. */}
      {turn.asks.map((asked, index) => (
        <div key={index} className="flex flex-col gap-2">
          <p className="text-text m-0 text-xs">{asked.question}</p>
          {/* The note as well: for a question that offered one it IS the answer, and shown
              nowhere it read as a question the person had walked away from. */}
          {[asked.answers.length === 0 ? null : asked.answers.join(', '), asked.note].map(
            (said, at) =>
              said !== null &&
              said !== undefined && (
                <div key={at} className="flex justify-end">
                  <p className={CONVERSATION_BUBBLE}>{said}</p>
                </div>
              ),
          )}
        </div>
      ))}

      {turn.lost && <p className="text-warning text-mini m-0">{t('assistant.lost')}</p>}

      {/* A chain that did not end by itself SAYS so: cut at its ceiling or stopped by hand, it
          reads exactly like one that finished, and a half-done job would pass for a done one. */}
      {turn.ending && (
        <p className="text-muted text-mini m-0 italic">{t(`assistant.ending.${turn.ending}`)}</p>
      )}
    </li>
  )
})

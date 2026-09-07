import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assistantAction, type ActionField } from '@shared/domain/assistant'
import { clipped } from '@shared/text'
import { Button } from '@/components/Button'
import { HINT_TOP } from '@/helpers/tooltip'
import { isAbsolutePath } from '@shared/domain/project'
import { getBridge } from '@/services/bridge'
import { traceFailure } from '@/services/diagnostics'
import { useAssistant } from '@/stores/assistant'
import { formatList } from '@/helpers/format'
import { confirmSentence } from '../../../confirmSentence'
import type { ConfirmRequest } from '../../../confirm'
import { CONVERSATION_CARD } from './conversationStyles'

/**
 * The yes-or-no, with what it engages stated first.
 *
 * A figure is quoted only when there is one: an upload has no price, and `null` means the API
 * declined to give one — said as such rather than filled in with a guess.
 */
/** 🛑 Bounded: a prompt is a paragraph, and a card the height of the thread hides its buttons. */
const VALUE_MAX = 160

export function AssistantConversationQuestion({ request }: { request: ConfirmRequest }) {
  const { t, i18n } = useTranslation()
  const action = assistantAction(request.action)
  const answer = useAssistant(state => state.answer)
  // 🛑 The card may CHANGE what it is approving: a folder the model guessed by name is one only
  // the person knows the place of. What leaves with the yes is this, never the request's own.
  const [input, setInput] = useState(request.input)

  // 🛑 The standing value opens the picker only where it POINTS somewhere: `project.create` takes
  // a NAME, and « Nouveau projet » as a starting folder is a place that does not exist.
  const pick = async (field: ActionField): Promise<void> => {
    const standing = input[field.key]
    try {
      const picked = await getBridge()?.dialog.pickPath(
        'folder',
        typeof standing === 'string' && isAbsolutePath(standing) ? standing : undefined,
      )
      if (picked) setInput(held => ({ ...held, [field.key]: picked }))
    } catch (reason) {
      // Cancelling answers `null`, so a THROW is the channel itself — and a button that did
      // nothing owes the journal a line.
      traceFailure('shell.dropped', 'pick folder', reason)
    }
  }

  /**
   * One value as a PERSON reads it, by the field's own kind — this is the only surface where
   * somebody rereads what they are approving, and `JSON.stringify` renders a list as brackets
   * and a boolean as `true`.
   */
  const valueShown = (value: unknown): string => {
    if (typeof value === 'boolean')
      return t(value ? 'assistant.confirm.on' : 'assistant.confirm.off')

    // Clipped on EVERY path: `assets.removeFromLibrary` takes a repeated field, and two hundred ids joined
    // by « et » is a card taller than the thread, with Allow and Refuse off the bottom of it.
    const written = Array.isArray(value)
      ? formatList(value.map(String), i18n.language, 'conjunction')
      : typeof value === 'string'
        ? value
        : (JSON.stringify(value) ?? '')

    return clipped(written, VALUE_MAX)
  }

  return (
    <div className={CONVERSATION_CARD}>
      <p className="text-text m-0 text-xs font-medium">
        {action ? t(action.titleKey) : request.action}
      </p>

      {/* 🛑 What it was called WITH — the half that was missing. See `ConfirmRequest.input`. */}
      {(action?.fields ?? []).map(field =>
        input[field.key] === undefined && field.picks !== 'folder' ? null : (
          <div key={field.key} className="flex flex-wrap items-center gap-2">
            <p className="text-text text-mini m-0">
              {t('assistant.confirm.value', {
                label: t(field.labelKey),
                value:
                  input[field.key] === undefined
                    ? t('assistant.confirm.pickUnset')
                    : valueShown(input[field.key]),
              })}
            </p>
            {field.picks === 'folder' && (
              <Button
                onClick={() => void pick(field)}
                {...HINT_TOP(t('assistant.confirm.pickFolderHint'))}
              >
                {t('assistant.confirm.pickFolder')}
              </Button>
            )}
          </div>
        ),
      )}

      <p className="text-muted text-mini m-0">
        {confirmSentence(request.commitment, request.estimate, t, i18n.language)}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={() => answer(true, input)}
          {...HINT_TOP(t('assistant.confirm.yesHint'))}
        >
          {t('assistant.confirm.yes')}
        </Button>
        <Button onClick={() => answer(false)} {...HINT_TOP(t('assistant.confirm.noHint'))}>
          {t('assistant.confirm.no')}
        </Button>
      </div>
    </div>
  )
}

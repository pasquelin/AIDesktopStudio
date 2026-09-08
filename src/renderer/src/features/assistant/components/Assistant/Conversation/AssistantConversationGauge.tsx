import { useTranslation } from 'react-i18next'
import type { AssistantWindow } from '@shared/domain/assistant'
import { ProgressBar } from '@/components/ProgressBar'
import { formatCompact } from '@/helpers/format'
import { HINT_TOP } from '@/helpers/tooltip'
import { useAssistant } from '@/stores/assistant'

/**
 * The door's own word, and the frames of a turn for a door that was never asked.
 *
 * 🛑 A door that answered `null` names NO window, and its answer stands: replying on the count a
 * PREVIOUS door left is how `2 067 / 4 096` was once shown for DeepSeek.
 */
function windowShown(
  door: AssistantWindow | null | undefined,
  windowTokens: number,
): AssistantWindow | undefined {
  if (door !== undefined) return door ?? undefined
  return windowTokens > 0 ? { size: windowTokens, unit: 'tokens', assumed: false } : undefined
}

/**
 * What the door in front is bounded by, and what the last exchange spent against it — beside the
 * field it measures, and BEFORE a word is typed.
 */
export function AssistantConversationGauge() {
  const { t, i18n } = useTranslation()
  const promptTokens = useAssistant(state => state.promptTokens)
  const promptChars = useAssistant(state => state.promptChars)
  const windowTokens = useAssistant(state => state.windowTokens)
  const door = useAssistant(state => state.door)

  const shown = windowShown(door, windowTokens)

  // Nothing at all until a door has been asked: an empty zone says less than a wrong figure.
  if (shown === undefined && door !== null) return null

  // 🛑 A DECLARED fallback is not a window, and painting a gauge against one would show a made-up
  // denominator as a measurement — the very defect this lot exists to remove.
  if (shown === undefined || shown.assumed) {
    // 🛑 The count ALONE, and nothing at all until there is one: naming the missing window on the
    // line took more room than the figure it qualified, and pushed Send onto a second row. What
    // the door will not say is said by the tooltip, which costs no width.
    if (promptTokens === 0) return null

    return (
      <span
        className="text-muted text-tiny min-w-0 truncate"
        {...HINT_TOP(
          shown?.assumed === true
            ? t('assistant.contextHintAssumed')
            : t('assistant.contextHintUnknown'),
        )}
      >
        {t('assistant.contextUnknown', { read: formatCompact(promptTokens, i18n.language) })}
      </span>
    )
  }

  // Characters against a character bound, tokens against a token one — never the two mixed.
  const byLength = shown.unit === 'characters'
  const read = byLength ? promptChars : promptTokens

  return (
    <span
      className="assistant-conversation-gauge flex min-w-0 items-center gap-2"
      {...HINT_TOP(byLength ? t('assistant.contextHintChars') : t('assistant.contextHint'))}
    >
      <span className="text-muted text-tiny truncate">
        {t('assistant.contextOf', {
          read: formatCompact(read, i18n.language),
          window: formatCompact(shown.size, i18n.language),
        })}
      </span>
      <ProgressBar
        ratio={read / shown.size}
        label={t('assistant.contextGauge')}
        className="assistant-conversation-gauge-bar w-12 shrink-0"
      />
    </span>
  )
}

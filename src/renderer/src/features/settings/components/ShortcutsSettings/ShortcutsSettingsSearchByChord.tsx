import { useTranslation } from 'react-i18next'
import type { Signature } from '@shared/domain/shortcut'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useChordCapture } from '@/hooks/useChordCapture'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { WindowButton } from '@/components/WindowButton'

/** Searches by pressing the combination rather than by naming it. */
export function ShortcutsSettingsSearchByChord({
  query,
  listening,
  onListen,
  onQuery,
}: {
  query: Signature | null
  listening: boolean
  onListen: () => void
  onQuery: (signature: Signature | null) => void
}) {
  const { t } = useTranslation()
  const label = useShortcutLabel()

  useChordCapture(signature => onQuery(signature === '' ? null : signature), listening)

  return (
    <div className="flex items-center gap-2">
      <WindowButton
        variant={listening ? 'primary' : 'quiet'}
        className="font-mono"
        {...HINT_BOTTOM(t('settings.findByChordHint'))}
        onClick={onListen}
      >
        {listening ? t('settings.pressAKey') : label(query) || t('settings.findByChord')}
      </WindowButton>

      {query !== null && (
        <WindowButton
          variant="secondary"
          {...HINT_BOTTOM(t('settings.showAllHint'))}
          onClick={() => onQuery(null)}
        >
          {t('settings.showAll')}
        </WindowButton>
      )}
    </div>
  )
}

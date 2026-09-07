import { useTranslation } from 'react-i18next'
import { HINT_TOP } from '@/helpers/tooltip'
import { isSettingsDraftDirty, useSettingsDraft } from '@/stores/settingsDraft'
import { WindowButton } from '@/components/WindowButton'

/**
 * Apply, Cancel, OK — and nothing at all while nothing is waiting, so the window is not a form
 * when it has nothing to submit.
 *
 * OK applies and closes; Cancel drops the buffer without writing. Neither exists to be pretty:
 * without them there is no way back from a session of changes, only a per-row return to the
 * factory value.
 */
export function SettingsWindowDraftBar() {
  const { t } = useTranslation()
  const dirty = useSettingsDraft(isSettingsDraftDirty)
  const apply = useSettingsDraft(state => state.apply)
  const cancel = useSettingsDraft(state => state.cancel)

  if (!dirty) return null

  return (
    <footer className="border-base-300 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-2">
      <WindowButton variant="secondary" {...HINT_TOP(t('settings.cancelHint'))} onClick={cancel}>
        {t('settings.cancel')}
      </WindowButton>
      <WindowButton {...HINT_TOP(t('settings.applyHint'))} onClick={() => void apply()}>
        {t('settings.apply')}
      </WindowButton>
      <WindowButton
        {...HINT_TOP(t('settings.confirmHint'))}
        onClick={() => void apply().then(() => window.close())}
      >
        {t('settings.confirm')}
      </WindowButton>
    </footer>
  )
}

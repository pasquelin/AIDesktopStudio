import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingPath } from '@shared/domain/settingsPath'
import { WINDOW_HELP } from '@/components/windowStyles'
import { useDictation } from '@/stores/dictation'
import { useSettings } from '@/stores/settings'
import { useSettingsDraft, useSettingValue } from '@/stores/settingsDraft'
import { SettingLine } from './Setting/SettingLine'
import { SETTING_COLUMN } from './settingStyles'
import { WindowSelect } from '@/components/WindowSelect'
import { SettingRestoreButton } from './Setting/SettingRestoreButton'

/** No descriptor names it — its options are whatever is plugged in — but the path is a leaf. */
const DEVICE: SettingPath = 'dictation.inputDeviceId'

const FIELD_ID = 'setting-dictation-input-device'

/**
 * The microphone to record from — the one setting no registry descriptor can express, because
 * its options are whatever is plugged in right now.
 *
 * Labels stay empty until the machine has granted access once, which is why the list is asked
 * for again on `devicechange` as well as on opening: a headset plugged in after the first
 * dictation appears named, and one plugged in before it appears named only afterwards.
 */
export function DictationSettings() {
  const { t } = useTranslation()
  const devices = useDictation(state => state.devices)
  const refreshDevices = useDictation(state => state.refreshDevices)
  const enabled = useSettings(state => state.settings.dictation.enabled)
  const stage = useSettingsDraft(state => state.stage)
  const staged = useSettingsDraft(state => state.touched.has(DEVICE))
  // Through the same buffer every other row uses: a choice made here waits for Apply, and
  // Cancel takes it back with the rest.
  const chosen = useSettingValue(DEVICE)

  useEffect(() => {
    if (!enabled) return

    void refreshDevices()
    const onChange = () => void refreshDevices()
    navigator.mediaDevices.addEventListener('devicechange', onChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
  }, [enabled, refreshDevices])

  if (!enabled) return null

  // The system default is the ABSENCE of the key, which is the only spelling the main process
  // accepts (`z.string().min(1).optional()`): staging `''` makes Apply throw, and the draft is
  // cleared before that write is awaited — the whole buffer would go with it, in silence.
  const current = typeof chosen === 'string' ? chosen : ''

  return (
    <div className={SETTING_COLUMN}>
      <SettingLine
        title={t('dictation.device')}
        labelFor={FIELD_ID}
        staged={staged}
        stagedLabel={t('settings.modified')}
        help={
          devices.length === 0 ? (
            <p className={WINDOW_HELP}>{t('dictation.noDevice')}</p>
          ) : undefined
        }
      >
        <WindowSelect
          id={FIELD_ID}
          data-sc="field:dictation.device"
          // Wider than the shared cap: the registry rows it was drawn for hold short words, and a
          // device reads « MacBook Pro Microphone (Built-in) ».
          className="w-full max-w-md"
          value={current}
          onChange={event => stage(DEVICE, event.target.value || undefined)}
        >
          {/* Empty rather than absent: the system default is a legitimate answer, and the one
              that survives a headset being unplugged. */}
          <option value="">{t('dictation.defaultDevice')}</option>
          {devices.map(device => (
            <option key={device.id} value={device.id}>
              {device.label || device.id}
            </option>
          ))}
        </WindowSelect>

        <SettingRestoreButton
          restorable={current !== ''}
          onRestore={() => stage(DEVICE, undefined)}
        />
      </SettingLine>
    </div>
  )
}

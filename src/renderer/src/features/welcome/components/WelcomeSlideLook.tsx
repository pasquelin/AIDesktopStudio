import { useTranslation } from 'react-i18next'
import { THEMES } from '@shared/domain/settings'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { WindowChip } from '@/components/WindowChip'
import { useSettings } from '@/stores/settings'
import { WelcomeCopy } from './WelcomeCopy'

/**
 * The theme, and nothing else: reduced motion and control density both left (Alban) — neither is a
 * taste a first launch has, and both read as restrictions. They live in the preferences.
 */
export function WelcomeSlideLook() {
  const { t } = useTranslation()
  const theme = useSettings(state => state.settings.appearance.theme)
  const setValue = useSettings(state => state.setValue)

  return (
    <div>
      <WelcomeCopy title={t('welcome.look.title')} body={t('welcome.look.body')} />
      <div className="flex flex-wrap justify-center gap-2">
        {THEMES.map(value => {
          const name = t(`settings.theme.${value}`)
          return (
            <WindowChip
              key={value}
              label={name}
              selected={theme === value}
              hint={t('welcome.look.themeHint', { name })}
              tip={HINT_BOTTOM}
              onClick={() => void setValue('appearance.theme', value)}
            />
          )
        })}
      </div>
    </div>
  )
}

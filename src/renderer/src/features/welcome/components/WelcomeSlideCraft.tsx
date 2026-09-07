import { useTranslation } from 'react-i18next'
import { NAVIGATION_PRESETS, type DeclaredPreset } from '@shared/domain/navigationPreset'
import { useSettings } from '@/stores/settings'
import { WelcomeCopy } from './WelcomeCopy'
import { WelcomeNavigationRow } from './WelcomeNavigationRow'

/** Every preset but `custom`, which is a screen of its own in the preferences and not a choice here. */
const DECLARED = NAVIGATION_PRESETS.filter((value): value is DeclaredPreset => value !== 'custom')

/**
 * The one question a first launch cannot answer for anyone: which 3D software's gestures the
 * viewport imitates. The seven workspace chips that opened it are gone (Alban).
 */
export function WelcomeSlideCraft() {
  const { t } = useTranslation()
  const preset = useSettings(state => state.settings.three.navigationPreset)
  const setValue = useSettings(state => state.setValue)

  return (
    <div>
      <WelcomeCopy title={t('welcome.craft.title')} body={t('welcome.craft.body')} />
      <div className="mx-auto flex w-fit flex-col">
        {DECLARED.map(value => {
          const name = t(`settings.navigationPreset.${value}`)
          return (
            <WelcomeNavigationRow
              key={value}
              preset={value}
              label={name}
              hint={t('welcome.craft.navigationHint', { name })}
              chosen={preset === value}
              onClick={() => void setValue('three.navigationPreset', value)}
            />
          )
        })}
      </div>
    </div>
  )
}

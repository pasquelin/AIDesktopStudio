import { useTranslation } from 'react-i18next'
import { LANGUAGES, LANGUAGE_PREFERENCES } from '@shared/i18n/languages'
import { SelectField } from '@/components/SelectField'
import { useSettings } from '@/stores/settings'
import { WelcomeCopy } from './WelcomeCopy'

export function WelcomeSlideLanguage() {
  const { t } = useTranslation()
  const language = useSettings(state => state.settings.general.language)
  const setValue = useSettings(state => state.setValue)

  return (
    <div>
      <WelcomeCopy title={t('welcome.language.title')} body={t('welcome.language.body')} />
      <SelectField
        scId="welcome.language"
        label={t('settings.language.title')}
        value={language}
        options={LANGUAGE_PREFERENCES.map(preference => {
          const item = LANGUAGES.find(one => one.code === preference)
          return {
            value: preference,
            label:
              preference === 'system'
                ? t('settings.language.system')
                : `${item?.flag ?? ''} ${item?.name ?? preference}`,
          }
        })}
        onChange={preference => void setValue('general.language', preference)}
        layout="stacked"
      />
    </div>
  )
}

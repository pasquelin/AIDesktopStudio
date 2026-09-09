import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@shared/i18n/languages'
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
        options={[
          { value: 'system', label: t('settings.language.system') },
          ...LANGUAGES.map(one => ({ value: one.code, label: `${one.flag} ${one.name}` })),
        ]}
        onChange={preference => void setValue('general.language', preference)}
        layout="stacked"
      />
    </div>
  )
}

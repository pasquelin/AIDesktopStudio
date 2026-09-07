import { useTranslation } from 'react-i18next'
import { LANGUAGES, LANGUAGE_PREFERENCES } from '@shared/i18n/languages'
import { HINT_BOTTOM } from '@/helpers/tooltip'
import { WindowChip } from '@/components/WindowChip'
import { useSettings } from '@/stores/settings'
import { WelcomeCopy } from './WelcomeCopy'

export function WelcomeSlideLanguage() {
  const { t } = useTranslation()
  const language = useSettings(state => state.settings.general.language)
  const setValue = useSettings(state => state.setValue)

  return (
    <div>
      <WelcomeCopy title={t('welcome.language.title')} body={t('welcome.language.body')} />
      <div className="flex flex-wrap justify-center gap-2">
        {LANGUAGE_PREFERENCES.map(preference => {
          const name =
            preference === 'system'
              ? t('settings.language.system')
              : (LANGUAGES.find(item => item.code === preference)?.name ?? preference)
          return (
            <WindowChip
              key={preference}
              label={name}
              selected={language === preference}
              hint={t('welcome.language.hint', { name })}
              tip={HINT_BOTTOM}
              onClick={() => void setValue('general.language', preference)}
            />
          )
        })}
      </div>
    </div>
  )
}

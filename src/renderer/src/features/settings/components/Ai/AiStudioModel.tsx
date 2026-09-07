import { useTranslation } from 'react-i18next'
import { ASSISTANT_MODELS } from '@shared/domain/assistant'
import { WINDOW_CAPTION, WINDOW_HELP, WINDOW_ROW } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'
import { useAssistant } from '@/stores/assistant'
import { useSettings } from '@/stores/settings'
import { WindowSelect } from '@/components/WindowSelect'

/** Which of the studio's four answers. Enumerated where a cloud's is typed: these are priced. */
export function AiStudioModel() {
  const { t } = useTranslation()
  const model = useSettings(state => state.settings.assistant.model)

  return (
    <li className={cn(WINDOW_ROW, 'flex-col items-start pl-6')}>
      <label className="flex w-full items-center gap-2">
        <span className={WINDOW_CAPTION}>{t('aiModels.cloudModel')}</span>
        <WindowSelect
          data-sc="field:ai.cloud.scenario.model"
          className="w-full max-w-xs"
          value={model}
          onChange={event => {
            const picked = ASSISTANT_MODELS.find(one => one === event.target.value)
            if (picked) useAssistant.getState().setModel(picked)
          }}
        >
          {ASSISTANT_MODELS.map(name => (
            <option key={name} value={name}>
              {t(`assistant.models.${name}`)}
            </option>
          ))}
        </WindowSelect>
      </label>
      <p className={WINDOW_HELP}>{t('aiModels.studioModelHelp')}</p>
    </li>
  )
}

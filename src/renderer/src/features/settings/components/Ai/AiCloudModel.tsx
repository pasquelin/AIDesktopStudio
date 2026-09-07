import { useTranslation } from 'react-i18next'
import { WindowInput } from '@/components/WindowInput'
import { defaultChatModel } from '@shared/domain/aiCloud'
import { fieldHandle } from '@/components/scHandle'
import { WINDOW_CAPTION, WINDOW_HELP, WINDOW_ROW } from '@/components/windowStyles'
import { cn } from '@/helpers/cn'
import { withoutKey } from '@/helpers/objects'
import { useCommittedText } from '@/hooks/useCommittedText'
import { useSettings } from '@/stores/settings'

export type AiCloudModelProps = {
  /** The cloud this names a model for. Its own default stands as the placeholder while none is. */
  providerId: string
}

/** Which model one cloud answers with. Free text: listing them would need a call, and a key. */
export function AiCloudModel({ providerId }: AiCloudModelProps) {
  const { t } = useTranslation()
  const cloudModels = useSettings(state => state.settings.assistant.cloudModels)
  const write = useSettings(state => state.write)

  // Emptied means "the one it declares", so the key LEAVES rather than being stored blank.
  const field = useCommittedText(cloudModels[providerId] ?? '', named => {
    const models =
      named === '' ? withoutKey(cloudModels, providerId) : { ...cloudModels, [providerId]: named }
    void write({ assistant: { cloudModels: models } })
  })

  return (
    <li className={cn(WINDOW_ROW, 'flex-col items-start pl-6')}>
      <label className="flex w-full items-center gap-2">
        <span className={WINDOW_CAPTION}>{t('aiModels.cloudModel')}</span>
        <WindowInput
          type="text"
          data-sc={fieldHandle(`ai.cloud.${providerId}.model`)}
          className="w-full max-w-xs"
          placeholder={defaultChatModel(providerId) ?? undefined}
          {...field}
        />
      </label>
      <p className={WINDOW_HELP}>{t('aiModels.cloudModelHelp')}</p>
    </li>
  )
}

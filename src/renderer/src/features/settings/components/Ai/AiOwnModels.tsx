import { AiOwnModelProgress } from './AiOwnModelProgress'
import { useTranslation } from 'react-i18next'
import type { ModelFamily } from '@shared/domain/model'
import { fieldHandle } from '@/components/scHandle'
import { WindowButton } from '@/components/WindowButton'
import { WINDOW_HELP } from '@/components/windowStyles'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useAiModels } from '@/stores/aiModels'
import { SettingLine } from '../Setting/SettingLine'

const OWN_COPY = {
  standard: {
    title: 'aiModels.ownModel',
    help: 'aiModels.ownModelHelp',
    button: 'aiModels.addOwnModel',
    failure: 'aiModels.ownModelUnreadable',
    sc: 'ai.ownModel',
  },
  motion: {
    title: 'aiModels.motionFolder',
    help: 'aiModels.motionFolderHelp',
    button: 'aiModels.addMotionFolder',
    failure: 'aiModels.motionFolderUnreadable',
    sc: 'ai.motionFolder',
  },
}

export function AiOwnModels({ family, busy }: { family?: ModelFamily; busy: boolean }) {
  const { t } = useTranslation()
  const add = useAiModels(state => state.addOwnAiModel)
  const failure = useAiModels(state => state.ownModelFailure)
  const importing = useAiModels(state => state.ownModelBusy)
  if (family !== undefined && family !== '3d') return null
  const profile = family === '3d' ? 'motion' : undefined
  const copy = OWN_COPY[profile ?? 'standard']
  return (
    <>
      <SettingLine title={t(copy.title)} help={t(copy.help)}>
        <WindowButton
          disabled={busy || importing}
          data-sc={fieldHandle(copy.sc)}
          {...HINT_LEFT(t(copy.help))}
          onClick={() => void add(profile)}
        >
          {t(copy.button)}
        </WindowButton>
      </SettingLine>
      <AiOwnModelProgress />
      {failure !== null && (
        <p className={WINDOW_HELP} role="status">
          {t(copy.failure)}
        </p>
      )}
    </>
  )
}

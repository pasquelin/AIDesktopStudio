import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useTasks } from '@/stores/tasks'
import { useAiModels } from '@/stores/aiModels'
import { AiFlightRow } from './AiFlightRow'

export function AiOwnModelProgress() {
  const { t } = useTranslation()
  const id = useAiModels(state => state.ownModelTaskId)
  const task = useTasks(state => (id ? state.running[id] : undefined))
  const connect = useTasks(state => state.connect)
  const cancel = useTasks(state => state.cancelTask)
  useEffect(connect, [connect])
  if (!task) return null
  return (
    <AiFlightRow
      ratio={task.ratio}
      label={t('aiModels.verifyingModel')}
      stop={t('aiModels.cancelInstall')}
      stopHint={t('aiModels.cancelVerification')}
      onStop={() => cancel(task.id)}
    />
  )
}

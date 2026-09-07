import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiClockOutline,
  mdiCogOutline,
} from '@mdi/js'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { StudioEvent } from '@shared/domain/studioEvent'
import { cn } from '@/helpers/cn'
import { ProgressBar } from './ProgressBar'
import { UiIcon } from './UiIcon'

function iconOf(event: StudioEvent): string {
  if (event.state === 'failed' || event.state === 'cancelled') return mdiAlertCircleOutline
  if (event.state === 'completed') return mdiCheckCircleOutline
  if (event.state === 'waiting') return mdiClockOutline
  return mdiCogOutline
}

function toneOf(event: StudioEvent): string {
  if (event.state === 'failed' || event.state === 'cancelled') return 'text-danger'
  if (event.state === 'completed') return 'text-success'
  return event.state === 'waiting' ? 'text-warning' : 'text-muted'
}

function missionLabel(event: StudioEvent, t: TFunction): string {
  if (event.type === 'mission.created') return t('assistant.missionEvent.mission.created')
  if (event.type === 'mission.planning') return t('assistant.missionEvent.mission.planning')
  if (event.type === 'mission.ready') return t('assistant.missionEvent.mission.ready')
  if (event.state === 'created') return t('assistant.missionEvent.mission.created')
  if (event.state === 'running') return t('assistant.missionEvent.mission.running')
  if (event.state === 'waiting') return t('assistant.missionEvent.mission.waiting')
  if (event.state === 'completed') return t('assistant.missionEvent.mission.completed')
  if (event.state === 'failed') return t('assistant.missionEvent.mission.failed')
  return t('assistant.missionEvent.mission.cancelled')
}

function eventLabel(event: StudioEvent, t: TFunction): string {
  if (event.category === 'mission') return missionLabel(event, t)
  if (event.category === 'action') return t('assistant.missionEvent.action')
  if (event.category === 'generation' || event.category === 'job') {
    return t('assistant.missionEvent.job')
  }
  if (event.type.endsWith('user_input')) return t('assistant.missionEvent.user')
  if (event.type.endsWith('sub_mission')) return t('assistant.missionEvent.child')
  if (event.type.endsWith('verify')) return t('assistant.missionEvent.verify')
  return t('assistant.missionEvent.step')
}

export function AssistantConversationMissionEvent({ event }: { event: StudioEvent }) {
  const { t } = useTranslation()
  const label = eventLabel(event, t)
  const detail = event.params?.['label']
  const ratio = event.progress?.ratio
  const error = event.params?.['error']

  return (
    <li className={cn('text-mini', event.stepId && 'pl-4')}>
      <details>
        <summary
          className={cn('flex cursor-pointer list-none items-center gap-1.5', toneOf(event))}
        >
          <UiIcon path={iconOf(event)} size={14} />
          <span>{label}</span>
        </summary>
        {detail !== undefined && <p className="text-muted m-0 pt-1 pl-5">{detail}</p>}
        {error !== undefined && <p className="text-danger m-0 pt-1 pl-5">{error}</p>}
        {ratio !== undefined && <ProgressBar ratio={ratio} label={label} className="mt-1 ml-5" />}
      </details>
    </li>
  )
}

import { memo } from 'react'
import { useMissions } from '@/stores/missions'
import { AssistantConversationMissionEvent } from './AssistantConversationMissionEvent'

export const AssistantConversationMissionEvents = memo(
  function AssistantConversationMissionEvents() {
    const events = useMissions(state => state.events)
    return events.map(event => <AssistantConversationMissionEvent key={event.id} event={event} />)
  },
)

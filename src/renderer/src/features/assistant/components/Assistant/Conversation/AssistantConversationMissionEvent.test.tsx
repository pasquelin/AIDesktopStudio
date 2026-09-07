import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StudioEvent } from '@shared/domain/studioEvent'
import { AssistantConversationMissionEvent } from '@/components/AssistantConversationMissionEvent'

const event: StudioEvent = {
  id: 'event_1',
  at: '2026-09-04T10:00:00.000Z',
  state: 'running',
  category: 'generation',
  type: 'mission.step.job',
  priority: 'normal',
  missionId: 'mission_1',
  stepId: 'step_1',
  messageKey: 'activity.missionStateChanged',
  params: { label: 'Generate the boat' },
  progress: { ratio: 0.5 },
}

describe('AssistantConversationMissionEvent', () => {
  it('shows an indented, expandable job with progress in the assistant flow', () => {
    render(<AssistantConversationMissionEvent event={event} />)

    expect(screen.getByText(/Génération|Generation/)).toBeInTheDocument()
    expect(screen.getByText('Generate the boat')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('listitem')).toHaveClass('pl-4')
  })
})

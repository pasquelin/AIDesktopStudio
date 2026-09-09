import { act, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, expect, it } from 'vitest'
import { TRANSLATIONS } from '@shared/i18n'
import { localizedError } from '@shared/localizedError'
import type { StudioEvent } from '@shared/domain/studioEvent'
import { AssistantConversationMissionEvent } from './AssistantConversationMissionEvent'

afterEach(async () => {
  await act(async () => {
    await i18next.changeLanguage('fr')
  })
})

it('renders a stored diagnostic in the current language after a language change', async () => {
  const event: StudioEvent = {
    id: 'event',
    at: '2026-09-08',
    state: 'failed',
    category: 'step',
    type: 'mission.step.action',
    priority: 'important',
    messageKey: 'activity.missionStateChanged',
    params: { error: localizedError('missingDocument').message },
  }
  render(<AssistantConversationMissionEvent event={event} />)
  expect(screen.getByText(TRANSLATIONS.fr.diagnostics.missingDocument)).toBeInTheDocument()
  await act(async () => {
    await i18next.changeLanguage('en')
  })
  expect(screen.getByText(TRANSLATIONS.en.diagnostics.missingDocument)).toBeInTheDocument()
  expect(screen.queryByText(TRANSLATIONS.fr.diagnostics.missingDocument)).not.toBeInTheDocument()
})

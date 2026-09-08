import { act, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { expect, it } from 'vitest'
import { TRANSLATIONS } from '@shared/i18n'
import { localizedError } from '@shared/localizedError'
import { ActivityListMessage } from './ActivityListMessage'

it('translates a stored diagnostic again when the window language changes', async () => {
  const detail = `Player: ${localizedError('playerAlreadyPresent').message}`
  await i18next.changeLanguage('fr')
  render(
    <ActivityListMessage
      entry={{
        id: 1,
        at: '2026-09-08T10:00:00Z',
        level: 'error',
        topic: 'document',
        messageKey: 'activity.scope.scene.player',
        detail,
      }}
      clamp={false}
    />,
  )
  try {
    expect(
      screen.getByText(`Player: ${TRANSLATIONS.fr.diagnostics.playerAlreadyPresent}`),
    ).toBeInTheDocument()
    await act(async () => {
      await i18next.changeLanguage('en')
    })
    expect(
      screen.getByText(`Player: ${TRANSLATIONS.en.diagnostics.playerAlreadyPresent}`),
    ).toBeInTheDocument()
  } finally {
    await act(async () => {
      await i18next.changeLanguage('fr')
    })
  }
})

import { afterEach, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '@shared/i18n'
import { localizedError } from '@shared/localizedError'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

it('writes diagnostic keys as English text in the technical log', async () => {
  vi.stubEnv('NODE_ENV', 'development')
  vi.resetModules()
  const printed = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { log, recordLogsTo } = await import('./log')
  const recorded = vi.fn()
  recordLogsTo(recorded)
  log.error('renderer/scene.player', localizedError('playerAlreadyPresent').message)
  expect(printed).toHaveBeenCalledWith(
    `[renderer/scene.player] ${TRANSLATIONS.en.diagnostics.playerAlreadyPresent}`,
  )
  expect(recorded).toHaveBeenCalledWith({
    level: 'error',
    scope: 'renderer/scene.player',
    message: TRANSLATIONS.en.diagnostics.playerAlreadyPresent,
  })
  recordLogsTo(null)
})

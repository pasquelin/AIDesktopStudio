import { LANGUAGES, TRANSLATIONS, fillHoles, textAt, type Language } from './i18n'
import { describe, expect, it, vi } from 'vitest'
import { MAX_LOG_MESSAGE } from './ipcDiagnostics'
import { boundedDiagnosticMessage, localizeErrorMessage, localizedError } from './localizedError'

describe('localized diagnostic errors', () => {
  it('translates a relayed error while preserving its subject and IPC prefix', () => {
    const error = localizedError('missingDocument', { name: 'a ] % \u001e \u001f image', count: 2 })
    const relayed = new Error(error.message)
    const prefix = "asset: Error invoking remote method 'document:save': Error: "
    const translate = vi.fn(() => 'translated')

    expect(localizeErrorMessage(prefix + relayed.message, translate)).toBe(prefix + 'translated')
    expect(translate).toHaveBeenCalledWith('diagnostics.missingDocument', {
      name: 'a ] % \u001e \u001f image',
      count: 2,
    })
  })

  it('preserves Unicode parameters and translates each diagnostic in a composed message', () => {
    const name = '\u00e9\u0065\u0301\u4e16\u754c\ud83c\udfa8\ud800'
    const first = localizedError('missingDocument', { name })
    const second = localizedError('missingDocument', { name: 'other' })
    const translate = vi.fn((_key: string, values: Record<string, string | number>) =>
      String(values.name),
    )

    expect(localizeErrorMessage(`${first.message} / ${second.message}`, translate)).toBe(
      `${name} / other`,
    )
  })

  it('leaves external text and damaged transport markers unchanged', () => {
    const text = 'HTTP 503: external \u001einvalid\u001f \u001e{\u001f diagnostic'
    const translate = vi.fn(() => 'translated')

    expect(localizeErrorMessage(text, translate)).toBe(text)
    expect(translate).not.toHaveBeenCalled()
  })

  it('still translates a long document name after the diagnostic transport limit', () => {
    const error = localizedError('missingDocument', { name: '\u4e16'.repeat(5000) })
    const transported = `asset: ${error.message}`.slice(0, MAX_LOG_MESSAGE)

    expect(localizeErrorMessage(transported, () => 'translated')).toBe('asset: translated')
    const longSubject = boundedDiagnosticMessage('asset'.repeat(2000), error, MAX_LOG_MESSAGE)
    expect(longSubject.length).toBeLessThanOrEqual(MAX_LOG_MESSAGE)
    expect(localizeErrorMessage(longSubject, () => 'translated')).toMatch(/translated$/)
  })
})

/** A relayed message as one language shows it, every diagnostic frame inside it translated. */
const shownIn = (code: Language, message: string): string =>
  localizeErrorMessage(message, (key, values) =>
    fillHoles(textAt(TRANSLATIONS[code], key), values, code),
  )

it('translates worker names carried inside diagnostic parameters in both languages', () => {
  const error = localizedError('workerFailed', {
    name: localizedError('workerRelief').message,
    reason: 'WebGL2',
  })
  for (const { code } of LANGUAGES) {
    expect(shownIn(code, error.message)).toBe(
      fillHoles(
        TRANSLATIONS[code].diagnostics.workerFailed,
        { name: TRANSLATIONS[code].diagnostics.workerRelief, reason: 'WebGL2' },
        code,
      ),
    )
  }
})

it('keeps an encoded subject whole when the external error consumes the transport budget', () => {
  const message = boundedDiagnosticMessage(
    localizedError('unnamedComponent').message,
    new Error('x'.repeat(3980)),
    MAX_LOG_MESSAGE,
  )
  const shown = localizeErrorMessage(message, () => 'component')
  expect(message.length).toBeLessThanOrEqual(MAX_LOG_MESSAGE)
  expect(shown).toMatch(/^component: x+$/)
  expect(shown).not.toContain('\u001e')
})

it('shortens nested error parameters without damaging either diagnostic frame', () => {
  const reason = localizedError('httpStatus', { url: 'x'.repeat(5000), status: 404 }).message
  const error = localizedError('workerFailed', {
    name: localizedError('workerRelief').message,
    reason,
  })
  for (const { code } of LANGUAGES) {
    const text = shownIn(code, error.message)
    expect(text).toContain('404')
    expect(text).toContain(TRANSLATIONS[code].diagnostics.workerRelief)
    for (const marker of ['\u001e', '\u001f', '{{']) expect(text).not.toContain(marker)
  }
})

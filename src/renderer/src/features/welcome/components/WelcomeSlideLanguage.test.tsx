import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '@shared/i18n/languages'
import { WelcomeSlideLanguage } from './WelcomeSlideLanguage'

/**
 * The first thing a newcomer sees, and the only screen whose words they may not read: whatever
 * the studio guessed from the machine, the way out is this picker. So every language it ships is
 * on it, each named in ITSELF — a reader looking for `日本語` is not looking for `Japanese`.
 */
describe('WelcomeSlideLanguage', () => {
  it('offers every language the studio ships, plus deferring to the machine', () => {
    render(<WelcomeSlideLanguage />)

    expect(screen.getAllByRole('option')).toHaveLength(LANGUAGES.length + 1)
  })

  it('names each language in itself, behind its flag', () => {
    render(<WelcomeSlideLanguage />)

    for (const { code, name, flag } of LANGUAGES) {
      expect(screen.getByRole('option', { name: `${flag} ${name}` }), code).toBeInTheDocument()
    }
  })
})

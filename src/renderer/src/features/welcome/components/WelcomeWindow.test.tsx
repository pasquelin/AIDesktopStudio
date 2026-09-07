import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { WELCOME_SLIDES, WELCOME_VERSION } from '@shared/domain/welcome'
import { installFakeBridge } from '@/services/fakeBridge'
import { WelcomeWindow } from './WelcomeWindow'

vi.mock('./WelcomeCanvas', () => ({
  WelcomeCanvas: () => <canvas aria-hidden="true" />,
}))

describe('WelcomeWindow', () => {
  beforeEach(() => {
    installFakeBridge()
  })

  it('opens on the language screen', () => {
    render(<WelcomeWindow />)
    expect(screen.getByRole('heading', { name: 'Choisissez votre langue' })).toBeInTheDocument()
  })

  /**
   * One mark, and OUTSIDE the rail: opening every slide put six copies in the document at once,
   * and `getByRole` refused to answer at all.
   */
  it('carries the mark once, above the carousel rather than on each slide', () => {
    render(<WelcomeWindow />)
    const mark = screen.getByRole('img', { name: 'AI Desktop Studio' })

    expect(mark.closest('header')).not.toBeNull()
    // The slides are the sections of the rail, and the window's own root carries
    // `overflow-hidden` too — reading that class would pass on a mark inside a slide.
    expect(mark.closest('section')).toBeNull()
  })

  it('advances a section at a time, without a scrollbar', async () => {
    render(<WelcomeWindow />)
    await userEvent.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(screen.getByRole('heading', { name: 'L’apparence' })).toBeInTheDocument()
    expect(document.querySelector('.overflow-hidden')).not.toBeNull()
  })

  /**
   * Dots and screens both come off `WELCOME_SLIDES`: as two positional arrays, a screen inserted
   * mid-list moved every title after it onto the wrong dot, and the count still matched.
   */
  it('names each step with the screen that step opens', async () => {
    render(<WelcomeWindow />)
    await userEvent.click(
      // The step number carries the locale's own space before the dash, which is not the one a
      // literal here would hold.
      screen.getByRole('button', { name: /Aller à l’étape 5.*Les modèles, section par section/ }),
    )

    expect(
      screen.getByRole('heading', { name: 'Les modèles, section par section' }),
    ).toBeInTheDocument()
  })

  it('still slides with the arrows while a button is focused', async () => {
    render(<WelcomeWindow />)
    screen.getByRole('button', { name: 'Continuer' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'L’apparence' })).toBeInTheDocument()
  })

  it('slides with the arrows, and stops rather than closing on the last screen', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<WelcomeWindow />)

    for (let step = 0; step < WELCOME_SLIDES.length + 1; step += 1) {
      await userEvent.keyboard('{ArrowRight}')
    }

    expect(screen.getByRole('heading', { name: 'Votre premier projet' })).toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    close.mockRestore()
  })

  it('runs the focused button on Enter rather than advancing', async () => {
    const write = vi.fn().mockResolvedValue(DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<WelcomeWindow />)

    screen.getByRole('button', { name: 'Passer' }).focus()
    await userEvent.keyboard('{Enter}')

    expect(write).toHaveBeenCalledWith({
      onboarding: {
        version: WELCOME_VERSION,
        completedAt: expect.any(String),
      },
    })
    expect(close).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: 'Choisissez votre langue' })).toBeInTheDocument()
    close.mockRestore()
  })

  /** Escape inside a field is the reflex for closing a select — it closed the window on a
   * half-typed API key instead. */
  it('leaves Escape alone while a field has the focus', async () => {
    const write = vi.fn().mockResolvedValue(DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })
    render(<WelcomeWindow />)

    const field = document.querySelector('input')
    field?.focus()
    await userEvent.keyboard('{Escape}')

    expect(write).not.toHaveBeenCalled()
  })

  /** The rail clips, it does not remove: tab used to walk into a slide six steps away. */
  it('takes the slides it is not showing out of the tab order', () => {
    render(<WelcomeWindow />)
    const sections = [...document.querySelectorAll('section')]

    expect(sections[0]?.hasAttribute('inert')).toBe(false)
    expect(sections.slice(1).every(section => section.hasAttribute('inert'))).toBe(true)
  })

  it('skips the rest and records that the welcome is done', async () => {
    const write = vi.fn().mockResolvedValue(DEFAULT_SETTINGS)
    installFakeBridge({ settings: { write } })
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})

    render(<WelcomeWindow />)
    await userEvent.click(screen.getByRole('button', { name: 'Passer' }))

    expect(write).toHaveBeenCalledWith({
      onboarding: {
        version: WELCOME_VERSION,
        completedAt: expect.any(String),
      },
    })
    expect(close).toHaveBeenCalledOnce()
    close.mockRestore()
  })
})

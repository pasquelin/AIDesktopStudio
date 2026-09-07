import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installFakeBridge } from '@/services/fakeBridge'
import { LicencesWindow } from './LicencesWindow'

// Unfolding a licence puts its WHOLE text in the DOM — that is the point of the panel — and
// `userEvent` re-checks pointability against all of it on every click. Under a loaded run the
// two-click case went past the default budget, which reads as a broken panel rather than a slow
// test. Raised rather than trimmed: what makes it slow is what it exists to prove.
vi.setConfig({ testTimeout: 20_000 })

describe('LicencesWindow', () => {
  beforeEach(() => {
    installFakeBridge()
  })

  it('keeps required attribution visible while licence texts are folded', () => {
    render(<LicencesWindow />)
    expect(screen.getByText('Built with Meta Llama 3')).toBeVisible()
    expect(screen.getByRole('button', { name: /^Meta Llama 3/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('names every component the studio ships', () => {
    render(<LicencesWindow />)

    expect(screen.getByRole('button', { name: /FFmpeg/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^three(?!-)/ })).toBeInTheDocument()
  })

  /**
   * The frame the four other windows outside the docks already wore. This one wrote it out again
   * — its own container, its own dragged header, its own tooltip host — which is how a window
   * ends up looking like a second application beside the one it opens from.
   */
  it('wears the shared window frame rather than one of its own', () => {
    render(<LicencesWindow />)

    expect(screen.getByText('Licences')).toBeInTheDocument()
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('button', { name: /FFmpeg/ }),
    )
  })

  /**
   * The window renders its own React tree, so the shell's `TooltipHost` never reached it. A
   * closed `<Tooltip>` renders nothing at all, so hovering is the only assertion that says the
   * host is mounted — and the sentence follows the state, since one row does both gestures.
   */
  it('mounts the shared tooltip, and says which of the two gestures the row offers', async () => {
    render(<LicencesWindow />)
    const entry = screen.getByRole('button', { name: /^three(?!-)/ })

    expect(entry).toHaveAttribute(
      'data-tooltip-content',
      'Déplie le texte complet de cette licence, ici même',
    )
    await userEvent.hover(entry)
    await waitFor(() => expect(entry).toHaveAttribute('aria-describedby'))

    await userEvent.click(entry)

    expect(entry).toHaveAttribute(
      'data-tooltip-content',
      'Replie ce texte — une seule licence reste ouverte à la fois',
    )
  })

  // A notice that needs a working network to be read is not a notice: the whole text is here.
  it('unfolds the full text of a licence, not a link to it', async () => {
    render(<LicencesWindow />)
    const entry = screen.getByRole('button', { name: /^three(?!-)/ })

    expect(entry).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(entry)

    expect(entry).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Copyright/)).toBeInTheDocument()
  })

  it('shows one at a time, so the list stays readable', async () => {
    render(<LicencesWindow />)

    await userEvent.click(screen.getByRole('button', { name: /^three(?!-)/ }))
    await userEvent.click(screen.getByRole('button', { name: /FFmpeg/ }))

    expect(screen.getByRole('button', { name: /^three(?!-)/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  // FFmpeg's licence asks for more than attribution: whoever receives the binary must be able to
  // reach the source it was built from — the archive of that build, not the project's front page.
  it('offers the sources of the copyleft component', async () => {
    render(<LicencesWindow />)
    await userEvent.click(screen.getByRole('button', { name: /FFmpeg/ }))

    // The archive the ledger points at, which moved off ffmpeg.org on 2026-08-15 — see the note
    // in RELEASE.md. What is guarded is that the window shows the offer, not where it is hosted.
    expect(screen.getByText(/n7\.1\.1\.tar\.gz/)).toBeInTheDocument()
  })

  /**
   * A typeface carries no version number, and the script used to fill the gap with an English
   * sentence that travelled through the generated JSON onto a French screen — past every guard,
   * since none of them reads a `.json`.
   */
  it('says in the reader’s language that a typeface ships with the application', () => {
    render(<LicencesWindow />)

    expect(screen.getByRole('button', { name: /^Lato/ })).toHaveTextContent(
      'livré avec l’application',
    )
  })

  // The offer is not merely a link: it is the link to THAT version, untouched. Both halves are
  // owed to the reader, and both are owed in their language.
  it('says the offered source is the version shipped, untouched', async () => {
    render(<LicencesWindow />)
    await userEvent.click(screen.getByRole('button', { name: /^mediabunny/ }))

    expect(screen.getByText(/Sources correspondantes, sans modification/)).toBeInTheDocument()
    expect(screen.getByText(/github\.com\/Vanilagy\/mediabunny/)).toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MediaTile } from './MediaTile'

function picture(): HTMLImageElement | null {
  return document.querySelector('img')
}

describe('MediaTile', () => {
  it('shows the picture and its caption', () => {
    render(<MediaTile url="https://cdn/one.png" caption="Dark Anime" />)

    expect(picture()).toHaveAttribute('src', 'https://cdn/one.png')
    expect(screen.getByText('Dark Anime')).toBeInTheDocument()
  })

  /**
   * The URLs the API signs expire, so a tile that has been on screen a while can find its
   * picture gone. Left alone, the browser draws its broken-image glyph inside the card.
   */
  it('falls back to the placeholder when the picture fails to load', () => {
    render(<MediaTile url="https://cdn/expired.png" caption="Gone" />)

    fireEvent.error(picture() as HTMLImageElement)

    expect(picture()).toBeNull()
    expect(screen.getByText('Gone')).toBeInTheDocument()
  })

  /**
   * A still is served over `ai-desktop-studio://`, whose resolver reads a catalogue that refuses while a
   * project closes. The tile asks once more — and asking means a NEW element: re-rendering the
   * same `src` fetches nothing at all, which is what the `key` is for.
   */
  it('asks a second time for a still, with a fresh element', () => {
    render(<MediaTile url="ai-desktop-studio://poster/asset_1" caption="Model" />)
    const first = picture()

    fireEvent.error(first as HTMLImageElement)

    expect(picture()).not.toBeNull()
    expect(picture()).not.toBe(first)
  })

  it('shows the placeholder when there is no picture at all', () => {
    render(<MediaTile caption="Scenario LLM" />)

    expect(picture()).toBeNull()
    expect(screen.getByText('Scenario LLM')).toBeInTheDocument()
  })

  // A sound has no thumbnail to fail at: the broken-image glyph reads as a bug in the browser.
  it('draws the icon it was given rather than a broken picture', () => {
    render(<MediaTile caption="pad.wav" fallbackIcon="M1 1" />)

    expect(document.querySelector('path')).toHaveAttribute('d', 'M1 1')
  })

  /**
   * A sound has a face of its own — its waveform — and it must sit UNDER the caption: laid over
   * the tile by the caller instead, it covered the name and the shelf had to be hovered to read.
   */
  it('draws the face it was given in place of the icon, caption and all', () => {
    render(<MediaTile caption="pad.wav" fallbackIcon="M1 1" face={<canvas />} />)

    expect(document.querySelector('canvas')).toBeInTheDocument()
    expect(document.querySelector('path')).toBeNull()
    expect(screen.getByText('pad.wav')).toBeInTheDocument()
  })

  // Never over the picture: an asset that HAS a still shows the still.
  it('keeps the picture when there is both a picture and a face', () => {
    render(<MediaTile url="https://cdn/one.png" caption="Take" face={<canvas />} />)

    expect(picture()).toHaveAttribute('src', 'https://cdn/one.png')
    expect(document.querySelector('canvas')).toBeNull()
  })

  // The caption has to stay readable over a picture; it is never the picture's own text.
  it('keeps the caption when a badge is given too', () => {
    render(<MediaTile url="https://cdn/one.png" caption="Flux" badge={<span>Featured</span>} />)

    expect(screen.getByText('Featured')).toBeInTheDocument()
    expect(screen.getByText('Flux')).toBeInTheDocument()
  })
})

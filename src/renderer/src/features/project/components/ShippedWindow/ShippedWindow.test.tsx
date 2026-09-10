import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundledAnimation } from '@shared/domain/animationLibrary'
import { SHIPPED_ROUTE } from '@shared/domain/shippedResources'
import { installFakeBridge } from '@/services/fakeBridge'
import { ShippedWindow } from './ShippedWindow'

function open(animations: BundledAnimation[] = []) {
  const installBundledCharacter = vi.fn(() =>
    Promise.resolve({
      level: 'medium' as const,
      assetId: 'asset_hero',
      path: '.resources/mesh/HeroMedium.glb',
    }),
  )
  const installBundledTextures = vi.fn(() =>
    Promise.resolve([
      { id: 'gridLarge' as const, assetId: 'asset_grid', path: '.resources/img/GridLarge.png' },
    ]),
  )
  window.location.hash = `#${SHIPPED_ROUTE}`
  installFakeBridge({
    assets: { installBundledCharacter, installBundledTextures },
    animations: { list: () => Promise.resolve(animations) },
  })

  return { installBundledCharacter, installBundledTextures }
}

describe('ShippedWindow', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  /** Named by the file, as the images below are: the level is what the name already says. */
  it('offers the shipped character at each density it ships at', async () => {
    open()
    render(<ShippedWindow />)

    expect(await screen.findByText('HeroLow')).toBeInTheDocument()
    expect(screen.getByText('HeroUltra')).toBeInTheDocument()
  })

  it('puts the density asked for into the project, and says it landed', async () => {
    const { installBundledCharacter } = open()
    render(<ShippedWindow />)

    await userEvent.click((await screen.findAllByRole('button', { name: 'Poser' }))[1]!)

    expect(installBundledCharacter).toHaveBeenCalledWith('medium')
    await waitFor(() => expect(screen.getByText('Posé dans le projet')).toBeInTheDocument())
  })

  /** One call lands the four, so one button does — three more would appear to do nothing. */
  it('puts the four working textures in with a single gesture', async () => {
    const { installBundledTextures } = open()
    render(<ShippedWindow />)

    await userEvent.click(await screen.findByRole('button', { name: 'Poser les quatre' }))

    expect(installBundledTextures).toHaveBeenCalledOnce()
  })

  /**
   * 🛑 The one family with no placing, and the window says WHY rather than leaving a missing
   * button to be read: a shipped clip is already offered wherever a clip is chosen, and copying
   * it in would be a second copy of the same bytes (G-P).
   */
  it('lists the shipped clips and says they need no placing', async () => {
    open([{ name: 'Walk', thumbnail: false }])
    render(<ShippedWindow />)

    expect(await screen.findByText('Walk')).toBeInTheDocument()
    expect(screen.getByText(/Rien à poser/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Poser les seize' })).toBeNull()
  })

  it('says an installation that ships no clip ships none', async () => {
    open([])
    render(<ShippedWindow />)

    expect(await screen.findByText(/ne contient aucune animation/)).toBeInTheDocument()
  })
})

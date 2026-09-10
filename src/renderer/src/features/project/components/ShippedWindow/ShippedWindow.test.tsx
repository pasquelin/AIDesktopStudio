import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundledAnimation } from '@shared/domain/animationLibrary'
import type { InstalledCharacter } from '@shared/domain/bundledCharacter'
import type { InstalledCheckerTexture } from '@shared/domain/checkerTexture'
import { SHIPPED_ROUTE } from '@shared/domain/shippedResources'
import { installFakeBridge } from '@/services/fakeBridge'
import { ShippedWindow } from './ShippedWindow'

function open(animations: BundledAnimation[] = []) {
  const hero: InstalledCharacter = {
    level: 'medium',
    assetId: 'asset_hero',
    path: '.resources/mesh/HeroMedium.glb',
  }
  const installBundledCharacter = vi.fn(() => Promise.resolve(hero))
  const grid: InstalledCheckerTexture[] = [
    { id: 'gridLarge', assetId: 'asset_grid', path: '.resources/img/GridLarge.png' },
  ]
  const installBundledTextures = vi.fn(() => Promise.resolve(grid))
  window.location.hash = `#${SHIPPED_ROUTE}`
  installFakeBridge({
    assets: { installBundledCharacter, installBundledTextures },
    animations: { list: () => Promise.resolve(animations) },
  })

  return { installBundledCharacter, installBundledTextures }
}

/** The lightest density the bundle holds — what an install answers when the asked-for one is gone. */
const lightest: InstalledCharacter = { level: 'low', assetId: 'asset_hero' }

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

  /**
   * 🛑 The window outlives the project — `help.open('shipped')` raises it with none open, and
   * closing a project does not close it. A refused placement that left the button disabled
   * would leave the person pressing a control that had stopped answering.
   */
  it('gives the button back when the placement is refused', async () => {
    window.location.hash = `#${SHIPPED_ROUTE}`
    installFakeBridge({
      assets: { installBundledCharacter: () => Promise.reject(new Error('no project')) },
      animations: { list: () => Promise.resolve([]) },
    })
    render(<ShippedWindow />)

    const place = (await screen.findAllByRole('button', { name: 'Poser' }))[0]!
    await userEvent.click(place)

    await waitFor(() => expect(place).toBeEnabled())
    expect(screen.getAllByText('Pas encore posé')).toHaveLength(4)
  })

  /** Keyed by what LANDED: the install answers the nearest density the bundle actually holds. */
  it('marks the density that landed, not the one that was asked for', async () => {
    window.location.hash = `#${SHIPPED_ROUTE}`
    installFakeBridge({
      assets: { installBundledCharacter: () => Promise.resolve(lightest) },
      animations: { list: () => Promise.resolve([]) },
    })
    render(<ShippedWindow />)

    // The last row is the densest; the install answers with the lightest it holds.
    await userEvent.click((await screen.findAllByRole('button', { name: 'Poser' }))[3]!)

    await waitFor(() =>
      expect(screen.getByTitle('HeroLow').parentElement).toHaveTextContent('Posé dans le projet'),
    )
    expect(screen.getByTitle('HeroUltra').parentElement).toHaveTextContent('Pas encore posé')
  })

  it('says an installation that ships no clip ships none', async () => {
    open([])
    render(<ShippedWindow />)

    expect(await screen.findByText(/ne contient aucune animation/)).toBeInTheDocument()
  })
})

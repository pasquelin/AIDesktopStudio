import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { PBR_CHANNELS } from '@shared/domain/material'
import { setChannel } from '@/engines/material/commands'
import type { ChannelOrigin } from '@/engines/material/materialState'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { reportFailure } from '@/services/diagnostics'
import { installFakeBridge } from '@/services/fakeBridge'
import { editPixelsOf } from '@/helpers/openAsset'
import { useAssets } from '@/stores/assets'
import { installMaterial } from '@/stores/material-fixtures'
import { inspectedChannel, useMaterialViews } from '@/stores/materialViews'
import { materialOf, useMaterials } from '@/stores/materials'
import { ChannelsSection } from './ChannelsSection'

vi.mock('@/services/diagnostics', () => ({ reportFailure: vi.fn() }))

/** Behind it sit the six editors, which is why the row reaches it and nothing here loads one. */
vi.mock('@/helpers/openAsset', () => ({ editPixelsOf: vi.fn(), openAssetById: vi.fn() }))

const picture = (id: string, name: string, location: Asset['location'] = 'local'): Asset => ({
  id,
  name,
  type: 'image',
  location,
  path: `assets/${id}.png`,
  tags: [],
  createdAt: '2026-08-08T00:00:00.000Z',
  width: 1024,
  height: 1024,
})

const BRICK = picture('img-1', 'Brique')

const channels = () => materialOf(useMaterials.getState(), 'doc-1').channels

/** The section reaches it through an `import()`, and behind it sit three.js and a WebGL context. */
const deriveMaterialChannel = vi.hoisted(() => vi.fn(() => Promise.resolve(true)))

vi.mock('@/features/material/deriveChannel', () => ({ deriveMaterialChannel }))

beforeEach(() => {
  installMaterial('doc-1')
  // Session state, shared by every document: a channel left inspected would leak into the next.
  useMaterialViews.setState({ inspected: {} })
  // The CATALOGUE, not the shelf: `useAssets.items` is the scope the browser is asking for, and
  // the Materials space narrows it — a list built out of it offers what has been browsed.
  installFakeBridge({ assets: { search: () => Promise.resolve([BRICK]) } })
  useAssets.setState({ items: [] })
  // `vi.fn` keeps its calls across tests, and a count read from the previous one proves nothing.
  deriveMaterialChannel.mockClear()
  vi.mocked(reportFailure).mockClear()
  vi.mocked(editPixelsOf).mockReset()
})

/**
 * Rendered, then let settle. The catalogue answers a PROMISE, and a row draws neither its
 * thumbnail nor the press that shows a channel flat until the picture it points at is resolved
 * against that answer — `LinkField` guards both on what the slot resolved to, never on the id.
 */
const show = async (): Promise<void> => {
  render(<ChannelsSection documentId="doc-1" />)
  await screen.findAllByRole('option', { name: 'Brique' })
}

/** The `<select>` of a channel's row — what the shared label column names. */
const slotOf = (channel: string): HTMLElement => screen.getByLabelText(channel)

/**
 * The whole LINE of a channel, reached by its name rather than by climbing from its picker: the
 * picker sits in a box of its own — the one holding its chevron — and a climb of one step landed
 * inside that box, beside none of the buttons the line ends on.
 */
const lineOf = (channel: string): HTMLElement => {
  const line = screen.getByText(channel).closest('div')
  if (!line) throw new Error(`no line drawn for ${channel}`)
  return line
}

const optionsOf = (channel: string): string[] =>
  within(slotOf(channel))
    .getAllByRole('option')
    .map(option => option.textContent ?? '')

const fill = (
  channel: 'height' | 'baseColor' | 'normal' | 'roughness',
  { assetId = 'img-1', origin = 'imported' }: { assetId?: string; origin?: ChannelOrigin } = {},
): void =>
  useMaterials
    .getState()
    .runCommand('doc-1', setChannel(channel, { assetId, origin, width: 8, height: 8 }))

describe('the channels of a material', () => {
  /** All eight, empty ones included: what a material lacks is as much the point as what it has. */
  it('draws one row per channel the domain declares, filled or not', async () => {
    await show()

    expect(screen.getAllByRole('combobox')).toHaveLength(PBR_CHANNELS.length)
    expect(slotOf('Couleur de base')).toBeInTheDocument()
    // The cavity mask included, which three has no slot for and the shader reads on its own.
    expect(slotOf('Cavité')).toBeInTheDocument()
  })

  it('puts a picture of the project into the channel it was chosen for', async () => {
    await show()

    fireEvent.change(slotOf('Normale'), { target: { value: 'img-1' } })

    expect(channels().normal?.assetId).toBe('img-1')
    // And only that one: eight rows offering the same list is how the wrong slot gets filled.
    expect(channels().baseColor).toBeUndefined()
  })

  it('keeps what the picture measures, which the seam reading is read against', async () => {
    await show()

    fireEvent.change(slotOf('Normale'), { target: { value: 'img-1' } })

    expect(channels().normal).toMatchObject({ origin: 'imported', width: 1024, height: 1024 })
  })

  /**
   * The badge is what tells a frozen channel from one that recomputes. Read from the origin the
   * command wrote, and painted OVER the press rather than under it — drawn before, it would be a
   * mark the picture hides. It takes no pointer of its own, so the whole picture still toggles.
   */
  it('says where the pixels of a channel came from, over the press and not under it', async () => {
    fill('height', { origin: 'generated' })
    await show()

    const badge = screen.getByRole('img', {
      name: 'Généré par un modèle — figé tel qu’il est arrivé',
    })
    const covering = badge.parentElement?.querySelector('button')
    expect(covering).not.toBeNull()
    expect(covering?.compareDocumentPosition(badge)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(badge).toHaveClass('pointer-events-none')
  })

  it('badges nothing on an empty channel', async () => {
    await show()

    expect(screen.queryByRole('img')).toBeNull()
  })

  it('empties a channel that holds something', async () => {
    fill('roughness')
    await show()

    // Aimed inside ONE line: every row of the section ends on the same two buttons, under the
    // same two names, so a name is not enough to say which of the eight is being emptied.
    await userEvent.click(
      within(lineOf('Rugosité')).getByRole('button', { name: 'Retirer l’image' }),
    )

    expect(channels().roughness).toBeUndefined()
  })

  /**
   * A drag announces its TYPE and never where its file is, so a cloud row reaches the line. The
   * ASSET travels to `placeMaterialChannel`, which is what lets the refusal name the file: an id
   * would leave the user reading a refusal about something they cannot recognise.
   */
  it('refuses a drop of a picture with no file yet, and says which one', async () => {
    const cloud = picture('cloud-1', 'Distante', 'cloud')
    useAssets.setState({ items: [cloud] })
    await show()

    const dataTransfer = dragTransfer()
    startAssetDrag({ dataTransfer }, { id: cloud.id, type: cloud.type })
    fireEvent.drop(slotOf('Normale'), { dataTransfer })

    await waitFor(() => expect(reportFailure).toHaveBeenCalledOnce())
    const [scope, , failure] = vi.mocked(reportFailure).mock.calls[0] ?? []
    expect(scope).toBe('material.channel')
    expect(String(failure)).toContain('Distante')
    expect(channels().normal).toBeUndefined()
  })

  describe('looking at one channel on its own', () => {
    /** The picture answers choosing and opening; what is left of a channel is in its menu. */
    const openMenu = async (channel: string): Promise<void> => {
      await userEvent.pointer({ keys: '[MouseRight]', target: slotOf(channel) })
      await screen.findByRole('menu')
    }

    it('marks the channel the document is showing flat', async () => {
      fill('normal')
      await show()
      await openMenu('Normale')

      await userEvent.click(screen.getByRole('menuitem', { name: /Regarder Normale seul/ }))

      expect(inspectedChannel(useMaterialViews.getState(), 'doc-1')).toBe('normal')
    })

    it('goes back to the lit material when the same channel is asked again', async () => {
      fill('normal')
      await show()
      await openMenu('Normale')
      await userEvent.click(screen.getByRole('menuitem', { name: /Regarder Normale seul/ }))

      await openMenu('Normale')
      await userEvent.click(screen.getByRole('menuitem', { name: /Revenir à la matière éclairée/ }))

      expect(inspectedChannel(useMaterialViews.getState(), 'doc-1')).toBeNull()
    })

    it('moves straight from one channel to another', async () => {
      fill('normal')
      fill('roughness')
      await show()
      await openMenu('Normale')
      await userEvent.click(screen.getByRole('menuitem', { name: /Regarder Normale seul/ }))

      await openMenu('Rugosité')
      await userEvent.click(screen.getByRole('menuitem', { name: /Regarder Rugosité seul/ }))

      expect(inspectedChannel(useMaterialViews.getState(), 'doc-1')).toBe('roughness')
    })

    /**
     * `BRICK` is an `image` deliberately: the gesture used to be refused for one, and this space
     * has no other way to Images.
     */
    it('opens the pixels of a channel on a double-click', async () => {
      const paint = vi.fn()
      vi.mocked(editPixelsOf).mockReturnValue({ workspace: 'image', run: paint })
      fill('baseColor')
      await show()

      // The picture of THIS row: eight slots draw the same press, and the label column names them.
      const picture = within(lineOf('Couleur de base')).getByRole('button', {
        name: /Choisir une image/,
      })
      await userEvent.dblClick(picture)

      expect(editPixelsOf).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' }))
      expect(paint).toHaveBeenCalled()
    })

    /** The document already fell back to the material; the row went on claiming to be current. */
    it('stops claiming to be current once its channel is emptied', async () => {
      fill('normal')
      await show()
      await openMenu('Normale')
      await userEvent.click(screen.getByRole('menuitem', { name: /Regarder Normale seul/ }))

      useMaterials.getState().runCommand('doc-1', setChannel('normal', null))

      await waitFor(() => expect(slotOf('Normale').closest('[data-selected]')).toBeNull())
    })
  })

  /**
   * The gutter of a property line holds two buttons and no more, so the fourth gesture a channel
   * carries moved to a menu on the row. Opened here by a right-click; Shift+F10 reaches it too,
   * the listener sitting on an ancestor of every control the focus can be on inside the row.
   */
  describe('computing a channel from another', () => {
    const rightClick = (channel: string): Promise<unknown> =>
      userEvent.pointer({ keys: '[MouseRight]', target: slotOf(channel) })

    /**
     * `sourceFor` decides: four channels have a recipe, four have none — and those four opened no
     * menu at all until the slot's own rows moved into it, `baseColor` first among them.
     */
    it('still opens a menu on a channel nothing computes', async () => {
      await show()

      await rightClick('Couleur de base')

      expect(screen.getByRole('menuitem', { name: /Parcourir les images/ })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: /Calculer depuis/ })).toBeNull()
    })

    it('computes the channel from the source the domain names', async () => {
      fill('height')
      await show()

      await rightClick('Normale')
      await userEvent.click(
        await screen.findByRole('menuitem', { name: /Calculer depuis Hauteur/ }),
      )

      expect(deriveMaterialChannel).toHaveBeenCalledWith('doc-1', 'normal')
    })

    /**
     * Offered and refused rather than absent: an empty source is something to go and fill, and a
     * row that simply is not there leaves nothing to read that from.
     */
    it('says which channel is missing instead of hiding the row', async () => {
      await show()

      await rightClick('Normale')

      const row = await screen.findByRole('menuitem', {
        name: /Calculer depuis Hauteur — Hauteur est vide/,
      })
      expect(row).toBeDisabled()
      expect(deriveMaterialChannel).not.toHaveBeenCalled()
    })

    /**
     * Each derivation opens a WebGL context of its own, and a browser evicts the oldest to hand
     * out the seventeenth — what would go black is a viewport somebody is looking at. So the
     * other rows go dead while one runs, they say why, and they come back.
     */
    it('closes every other derivation while one is running, and reopens them after', async () => {
      let finish = (): void => {}
      deriveMaterialChannel.mockImplementationOnce(
        () => new Promise<boolean>(resolve => (finish = () => resolve(true))),
      )
      fill('height')
      fill('baseColor')
      await show()

      await rightClick('Normale')
      await userEvent.click(
        await screen.findByRole('menuitem', { name: /Calculer depuis Hauteur/ }),
      )

      await rightClick('Normale')
      expect(await screen.findByRole('menuitem', { name: /Calcul en cours/ })).toBeDisabled()

      await rightClick('Rugosité')
      expect(
        await screen.findByRole('menuitem', { name: /un autre canal est en calcul/ }),
      ).toBeDisabled()

      finish()

      // Without it, every derivable row of the session stays dead after the first computation.
      await rightClick('Rugosité')
      expect(
        await screen.findByRole('menuitem', { name: /Calculer depuis Couleur de base$/ }),
      ).toBeEnabled()
    })
  })

  describe('what a channel is allowed to hold', () => {
    /**
     * `isLocalPicture`, the filter every texture slot already applies: a cloud row would be
     * offered, chosen, and show nothing at all.
     */
    it('offers no picture that has no file to decode yet', async () => {
      installFakeBridge({
        assets: {
          search: () => Promise.resolve([BRICK, picture('cloud-1', 'Distante', 'cloud')]),
        },
      })
      await show()

      expect(optionsOf('Normale')).not.toContain('Distante')
    })

    /**
     * The list and the drop have to answer the same question. `accepts` is `PICTURES`, and
     * `placeMaterialChannel` takes any of the three — so listing `image` alone meant a local skybox
     * dropped onto Roughness fine and was never offered.
     */
    it('offers a generated sky and a generated texture, which a channel can hold', async () => {
      installFakeBridge({
        assets: {
          search: () =>
            Promise.resolve([
              BRICK,
              { ...picture('sky-1', 'Coucher'), type: 'skybox' },
              { ...picture('tex-1', 'Rouille'), type: 'image' },
            ]),
        },
      })
      await show()

      expect(optionsOf('Normale')).toEqual(expect.arrayContaining(['Coucher', 'Rouille']))
    })

    /**
     * The other half: the shelf is PAGED and replaced by whatever was searched for, so a picture
     * it happens to hold says nothing about the project. Only the catalogue answers that.
     */
    it('offers none the catalogue does not hold, whatever the shelf is showing', async () => {
      useAssets.setState({ items: [picture('ghost-1', 'Fantôme')] })
      await show()

      expect(optionsOf('Normale')).not.toContain('Fantôme')
    })

    /**
     * A document outlives the picture it points at. Left to the browser's own fallback, a
     * `<select>` given a value none of its options carries shows the FIRST one — so a deleted
     * texture read as whatever sat at the top of the list.
     */
    it('says a picture is gone rather than reading as the first of the list', async () => {
      fill('normal', { assetId: 'gone-1' })
      await show()

      expect(optionsOf('Normale')).toContain('Image introuvable')
    })
  })
})

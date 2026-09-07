import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LinkField, type LinkFieldProps } from './LinkField'

const OPTIONS = [{ id: 'tex-1', name: 'Brique', url: 'ai-desktop-studio://asset/tex-1' }]

const BROWSE = { label: 'Parcourir', hint: 'Choisir dans tout le projet', run: vi.fn() }
const OPEN = { label: 'Ouvrir', hint: 'Ouvre la texture', run: vi.fn() }

const rightClick = async (props: Partial<LinkFieldProps> = {}): Promise<void> => {
  const { container } = render(
    <LinkField
      label="Texture"
      value="tex-1"
      options={OPTIONS}
      onChange={vi.fn()}
      missingLabel="Introuvable"
      clearLabel="Retirer la texture"
      clearHint="Vide ce slot"
      {...props}
    />,
  )
  await userEvent.pointer({ keys: '[MouseRight]', target: container.firstElementChild as Element })
}

describe('the third gesture of a link row', () => {
  /**
   * Everything the SLOT can do, on every row that draws one — before this it existed on the eight
   * channels of a material and nowhere else.
   */
  it('holds what the row can do, and runs it', async () => {
    await rightClick({ browse: BROWSE, open: OPEN, emptyLabel: 'Aucune' })

    await userEvent.click(screen.getByRole('menuitem', { name: 'Ouvrir' }))

    expect(OPEN.run).toHaveBeenCalled()
  })

  /**
   * The words are the caller's: the row read "Remove the texture" on a SKY, which is the one slot
   * whose emptying puts the studio's own back.
   */
  it('reads the emptying out in the words the slot was given', async () => {
    await rightClick({
      browse: BROWSE,
      emptyLabel: 'Studio',
      clearLabel: 'Revenir au studio',
      clearHint: 'Rend la vue au ciel du studio',
    })

    expect(screen.getByRole('menuitem', { name: 'Revenir au studio' })).toBeInTheDocument()
  })

  // A row that cannot be emptied has no such state to reach — `emptyLabel` is what says so.
  it('offers no emptying where the link cannot be empty', async () => {
    await rightClick({ browse: BROWSE, open: OPEN })

    expect(screen.queryByRole('menuitem', { name: 'Retirer la texture' })).toBeNull()
  })

  /** A document outlives the picture it points at: an id the project lost opens nothing. */
  it('offers no opening for a value the options no longer carry', async () => {
    await rightClick({ value: 'gone-1', browse: BROWSE, open: OPEN })

    expect(screen.queryByRole('menuitem', { name: 'Ouvrir' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Parcourir' })).toBeInTheDocument()
  })

  // A right-click that opens an empty surface answers by covering the row it was aimed at.
  it('opens nothing at all on a row with nothing to offer', async () => {
    await rightClick()

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

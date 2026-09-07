import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PICTURES, type Asset, type AssetType } from '@shared/domain/asset'
import { startAssetDrag } from '@/helpers/assetDrag'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { useAssets } from '@/stores/assets'
import { LinkField, type LinkFieldProps } from './LinkField'
import type { LinkOption } from './linkOption'

const OPTIONS: LinkOption[] = [
  { id: 'tex-1', name: 'Brick', url: 'ai-desktop-studio://asset/tex-1' },
  { id: 'tex-2', name: 'Rust', url: 'ai-desktop-studio://asset/tex-2' },
]

/** What the drag carries — resolved against the catalogue by the drop, never sent with it. */
const DROPPED: Asset = {
  id: 'asset_1',
  name: 'moss.png',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-08-14T10:00:00.000Z',
}

function dragging(type: AssetType): DataTransfer {
  const dataTransfer = dragTransfer()
  startAssetDrag({ dataTransfer }, { id: DROPPED.id, type })
  return dataTransfer
}

/** The field with everything a case does not vary already answered. */
function Slot(props: Partial<LinkFieldProps> & Pick<LinkFieldProps, 'value' | 'onChange'>) {
  return (
    <LinkField
      label="Texture"
      options={OPTIONS}
      emptyLabel="Aucune"
      missingLabel="Introuvable"
      clearLabel="Retirer la texture"
      clearHint="Vide ce slot"
      {...props}
    />
  )
}

function renderField(value: string | null = null, options = OPTIONS) {
  const onChange = vi.fn()
  render(<Slot value={value} onChange={onChange} options={options} />)
  return { onChange, select: screen.getByRole('combobox') }
}

/** The field, and the surface a drop lands on — its outermost element. */
function renderSlot(props: Partial<LinkFieldProps> & Pick<LinkFieldProps, 'onChange'>) {
  const { container } = render(<Slot value={null} {...props} />)
  return container.firstElementChild as Element
}

const OPEN = { label: 'Ouvrir', hint: 'Ouvre la texture', run: () => {} }
const PRESS = { label: 'Choisir', hint: 'Choisir une autre image', run: () => {} }
const BROWSE = { label: 'Parcourir', hint: 'Choisir dans tout le projet', run: () => {} }

describe('LinkField', () => {
  /**
   * The name sits in the shared label column, like every other attribute of the panel. It used to
   * ride under the value as a subtitle, which put this row's picture where no other row had one.
   */
  it('names itself in the column every property line uses', () => {
    renderField('tex-2')

    expect(screen.getByLabelText('Texture')).toBe(screen.getByRole('combobox'))
  })

  it('says the slot is empty rather than showing nothing', () => {
    const { select } = renderField(null)

    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Aucune' })).toBeInTheDocument()
  })

  it('names what the slot holds', () => {
    renderField('tex-2')

    expect(screen.getByRole('combobox')).toHaveValue('tex-2')
  })

  it('reports the identifier of what was picked, never the picture', () => {
    const { onChange, select } = renderField()

    fireEvent.change(select, { target: { value: 'tex-1' } })

    expect(onChange).toHaveBeenCalledWith('tex-1')
  })

  it('empties the slot through the same list', () => {
    const { onChange, select } = renderField('tex-1')

    fireEvent.change(select, { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('clears the slot from the row itself', async () => {
    const onChange = vi.fn()
    render(<Slot value="tex-1" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Retirer la texture/ }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  /**
   * Drawn but inert while there is nothing to clear, since 2026-08-19: the button appearing with
   * the first picture chosen used to narrow the select the pointer was still over.
   */
  it('holds the clear button in place, disabled, while the slot is empty', () => {
    render(<Slot value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Retirer la texture/ })).toBeDisabled()
  })

  /**
   * A `<select>` handed a value none of its options carries falls back to the FIRST one, silently.
   * A material pointing at a deleted texture therefore came out reading as whatever sat at the top
   * of the list — so the missing id is listed as its own entry, and disabled.
   */
  it('says so when it points at something the project no longer holds', () => {
    renderField('tex-gone')

    const missing = screen.getByRole('option', { name: 'Introuvable' })

    expect(screen.getByRole('combobox')).toHaveValue('tex-gone')
    expect(missing).toBeDisabled()
  })

  /** No empty entry and no cross: a caption has to be set in SOMETHING — see `FontField`. */
  it('offers no empty state to a link that cannot have one', () => {
    render(<Slot value="tex-1" onChange={vi.fn()} emptyLabel={undefined} />)

    expect(screen.queryByRole('option', { name: 'Aucune' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retirer la texture/ })).not.toBeInTheDocument()
  })

  it('offers the whole project only where the caller can show it', () => {
    render(<Slot value={null} onChange={vi.fn()} browse={BROWSE} />)

    expect(screen.getByRole('button', { name: /Parcourir/ })).toBeInTheDocument()
  })

  it('draws no browse button where nothing would answer it', () => {
    render(<Slot value={null} onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /Parcourir/ })).not.toBeInTheDocument()
  })

  describe('the picture the slot holds', () => {
    beforeEach(() => {
      useAssets.setState({ items: [DROPPED] })
    })

    it('takes an asset dragged onto the row', async () => {
      const onChange = vi.fn()
      const row = renderSlot({ onChange, accepts: PICTURES })

      fireEvent.drop(row, { dataTransfer: dragging('image') })

      await waitFor(() => expect(onChange).toHaveBeenCalledWith('asset_1'))
    })

    // Which kinds a row welcomes, and what it draws while one flies over it, belong to
    // `AssetDropTarget`. What this one owns is only whether the field mounts one at all —
    // undroppable where a drop means nothing, as `FontField` is.
    it('takes nothing at all where the caller named no kind', () => {
      const onChange = vi.fn()
      const row = renderSlot({ onChange })

      fireEvent.drop(row, { dataTransfer: dragging('image') })

      expect(onChange).not.toHaveBeenCalled()
    })

    // The studio's one gesture for opening, shared with the explorer and the asset browser.
    it('opens what it holds on a double-click of its picture', async () => {
      const run = vi.fn()
      render(<Slot value="tex-1" onChange={vi.fn()} open={{ ...OPEN, run }} />)

      await userEvent.dblClick(screen.getByRole('button', { name: 'Ouvrir' }))

      expect(run).toHaveBeenCalled()
    })

    it('opens what it holds on a double-click of its selected value', async () => {
      const run = vi.fn()
      render(<Slot value="tex-1" onChange={vi.fn()} open={{ ...OPEN, run }} />)

      await userEvent.dblClick(screen.getByRole('combobox'))

      expect(run).toHaveBeenCalledOnce()
    })

    // A focus stop that leads nowhere is one more Tab to cross for nothing.
    it('offers nothing to open while the slot is empty', () => {
      render(<Slot value={null} onChange={vi.fn()} open={OPEN} />)

      expect(screen.queryByRole('button', { name: 'Ouvrir' })).not.toBeInTheDocument()
    })

    it('lets an empty slot choose its first picture from its thumbnail', async () => {
      const pick = vi.fn()
      render(<Slot value={null} onChange={vi.fn()} press={{ ...PRESS, run: pick }} open={OPEN} />)

      await userEvent.click(screen.getByRole('button', { name: 'Choisir' }))

      expect(pick).toHaveBeenCalledOnce()
    })

    it('does not try to open a missing picture on a double-click', async () => {
      const pick = vi.fn()
      const open = vi.fn()
      render(
        <Slot
          value="tex-gone"
          onChange={vi.fn()}
          press={{ ...PRESS, run: pick }}
          open={{ ...OPEN, run: open }}
        />,
      )

      await userEvent.dblClick(screen.getByRole('button', { name: 'Choisir' }))

      expect(pick).toHaveBeenCalledOnce()
      expect(open).not.toHaveBeenCalled()
    })

    /** A document outlives the picture it points at: nothing rewrites a material on deletion. */
    it('offers nothing to open for an id the project no longer holds', () => {
      render(<Slot value="tex-gone" onChange={vi.fn()} open={OPEN} />)

      expect(screen.queryByRole('button', { name: 'Ouvrir' })).not.toBeInTheDocument()
    })

    // Twenty-eight pixels do not tell a normal map from an albedo.
    it('shows the picture large once the pointer has rested on it', async () => {
      render(<Slot value="tex-1" onChange={vi.fn()} open={OPEN} />)

      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Ouvrir' }))

      await waitFor(() =>
        expect(screen.getByRole('img', { name: 'Brick' })).toHaveAttribute(
          'src',
          'ai-desktop-studio://asset/tex-1',
        ),
      )
    })

    /** Opening on every crossing would flash over a stack of five slots on the way down. */
    it('shows nothing for a pointer merely passing over it', async () => {
      render(<Slot value="tex-1" onChange={vi.fn()} open={OPEN} />)
      const picture = screen.getByRole('button', { name: 'Ouvrir' })

      fireEvent.pointerEnter(picture)
      fireEvent.pointerLeave(picture)
      await new Promise(settle => setTimeout(settle, 600))

      expect(screen.queryByRole('img', { name: 'Brick' })).not.toBeInTheDocument()
    })

    /**
     * The single press waits out the window a second click could land in — without that, a
     * double-click meant for the editor put the picker on screen first.
     */
    it('presses on a single click and opens on a double one, never both', async () => {
      const pick = vi.fn()
      const open = vi.fn()
      render(
        <Slot
          value="tex-1"
          onChange={vi.fn()}
          press={{ ...PRESS, run: pick }}
          open={{ ...OPEN, run: open }}
        />,
      )
      const picture = screen.getByRole('button', { name: 'Choisir' })

      await userEvent.dblClick(picture)
      expect(open).toHaveBeenCalledTimes(1)
      // The whole point: the deferred press was cancelled rather than fired before the opening.
      await new Promise(settle => setTimeout(settle, 400))
      expect(pick).not.toHaveBeenCalled()

      await userEvent.click(picture)
      await waitFor(() => expect(pick).toHaveBeenCalledTimes(1))
    })

    // The press names the button where a slot offers both: it is the gesture a hand reaches for
    // first, and the tooltip is where the other one is spelled out.
    it('names the press after the single click where a slot offers both', () => {
      render(<Slot value="tex-1" onChange={vi.fn()} press={PRESS} open={OPEN} />)

      expect(screen.getByRole('button', { name: 'Choisir' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ouvrir' })).toBeNull()
    })

    // A slot that simply stayed empty while a library picture was being fetched read as a drop
    // that had failed.
    it('says the picture is on its way while it is being fetched', () => {
      render(<Slot value="tex-1" onChange={vi.fn()} busy busyLabel="Téléchargement" />)

      expect(screen.getByRole('status', { name: 'Téléchargement' })).toBeInTheDocument()
    })
  })
})

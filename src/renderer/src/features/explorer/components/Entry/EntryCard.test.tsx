import { mdiFileOutline } from '@mdi/js'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { EntryCard } from './EntryCard'

const card = (props: Partial<Parameters<typeof EntryCard>[0]> = {}) => {
  const onPickUp = vi.fn()
  const { container } = render(
    <EntryCard
      name="facade.jpg"
      icon={mdiFileOutline}
      kind="file"
      open={false}
      dragIds={['Images/facade.jpg']}
      pickable
      accepts={false}
      onDropInto={vi.fn()}
      onPickUp={onPickUp}
      onRelease={vi.fn()}
      {...props}
    />,
  )

  const tile = container.querySelector('[draggable]')
  if (!(tile instanceof HTMLElement)) throw new Error('no tile')
  return { tile, onPickUp }
}

describe('EntryCard', () => {
  /**
   * The gesture starts on the `<img>`, never on the card: a picture is natively draggable, so
   * `draggable={false}` on the card does not stop it and the handler has to read `pickable`
   * itself. What the studio keeps for itself was draggable by its preview.
   */
  it('refuses a drag started on the picture of a card that may not be picked up', () => {
    const { tile, onPickUp } = card({ pickable: false, preview: 'ai-desktop-studio://thumb/x' })
    const picture = tile.querySelector('img')

    fireEvent.dragStart(picture!, { dataTransfer: dragTransfer() })

    expect(onPickUp).not.toHaveBeenCalled()
  })

  it('carries a drag started on the picture of a card that may', () => {
    const { tile, onPickUp } = card({ preview: 'ai-desktop-studio://thumb/x' })

    fireEvent.dragStart(tile.querySelector('img')!, { dataTransfer: dragTransfer() })

    expect(onPickUp).toHaveBeenCalledWith(['Images/facade.jpg'])
  })

  /**
   * One tile has to say both what the entry is and what it holds: neither the framed square the
   * grid drew before, nor a silhouette that hides the picture.
   */
  it('cuts the thumbnail of a file to the document silhouette', () => {
    const { tile } = card({ preview: 'ai-desktop-studio://thumb/x' })

    expect(tile.querySelector('img')?.className).toContain('document-cutout')
  })

  it('refuses a drag while the name is being typed', () => {
    const { tile, onPickUp } = card({ onRename: vi.fn() })

    fireEvent.dragStart(tile, { dataTransfer: dragTransfer() })

    expect(onPickUp).not.toHaveBeenCalled()
  })
})

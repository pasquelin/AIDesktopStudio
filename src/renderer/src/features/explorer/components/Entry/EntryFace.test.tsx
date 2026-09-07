import { mdiFolder, mdiFolderOutline, mdiVolumeHigh } from '@mdi/js'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EntryFace } from './EntryFace'

describe('the shape a grid tile draws', () => {
  it('tints the folder of a section and knocks the section glyph out of it', () => {
    const { container } = render(
      <EntryFace kind="folder" icon={mdiVolumeHigh} ink="text-domain-audio" />,
    )

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-domain-audio')
    // The PATH, not just the presence: `SOLID.folder` in the emblem would draw a folder inside a
    // folder, and every suite would stay green on it.
    expect(container.querySelectorAll('path')[1]?.getAttribute('d')).toBe(mdiVolumeHigh)
  })

  /**
   * `ExplorerBody` hands `ink` to every entry, and a document's is a real `text-domain-*`. Only
   * the folder test keeps a file or a document from wearing an emblem of its own.
   */
  it('leaves a document its plain silhouette though it has a section', () => {
    const { container } = render(
      <EntryFace kind="document" icon={mdiVolumeHigh} ink="text-domain-audio" />,
    )

    expect(container.querySelector('.folder-emblem')).toBeNull()
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-muted/80')
  })

  it('leaves a folder of no section its plain silhouette', () => {
    const { container } = render(<EntryFace kind="folder" icon={mdiFolderOutline} />)

    expect(container.querySelector('.folder-emblem')).toBeNull()
  })

  /**
   * `folder-emblem` places the glyph by the coordinates of THIS path — body 6→20 of a 24 viewBox.
   * Remodel it upstream and the emblem slides onto the ground with every other suite green.
   */
  it('is placed against the folder path the utility was measured on', () => {
    expect(mdiFolder).toBe(
      'M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z',
    )
  })
})

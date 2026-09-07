import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SCENE_TEMPLATE_IDS } from '@shared/domain/sceneTemplate'
import { NewDocumentTemplates } from './NewDocumentTemplates'

describe('NewDocumentTemplates', () => {
  it('offers every template the studio knows, on one line', () => {
    render(<NewDocumentTemplates value="basic" onChange={() => {}} />)

    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getAllByRole('button')).toHaveLength(SCENE_TEMPLATE_IDS.length)
  })

  it('answers with the template that was pressed', async () => {
    const onChange = vi.fn()
    render(<NewDocumentTemplates value="basic" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Studio photo' }))

    expect(onChange).toHaveBeenCalledWith('photoStudio')
  })

  it('marks the chosen one and no other', () => {
    render(<NewDocumentTemplates value="archvis" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'Architecture' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Vide' })).toHaveAttribute('aria-pressed', 'false')
  })

  // The line is the whole of what this lot bought: eleven squares over two rows cost the form the
  // height its folder picker needed, and a twelfth template now costs none.
  it('scrolls the line rather than wrapping it', () => {
    render(<NewDocumentTemplates value="basic" onChange={() => {}} />)

    expect(screen.getByRole('list')).toHaveClass('flex', 'overflow-x-auto')
  })

  it('keeps the shelves in order, general first and machine last', () => {
    render(<NewDocumentTemplates value="basic" onChange={() => {}} />)

    const drawn = screen.getAllByRole('button').map(tile => tile.getAttribute('data-sc'))

    expect(drawn).toEqual(SCENE_TEMPLATE_IDS.map(id => `field:document.template.${id}`))
  })

  /**
   * The section's own hue and no other: one colour code in this window, the very one the column
   * beside it gives `Scène`. A hue of its own here would say a template belongs somewhere else.
   */
  it('inks every glyph in the hue the section already wears', () => {
    const { container } = render(<NewDocumentTemplates value="basic" onChange={() => {}} />)

    const inks = [...container.querySelectorAll('svg')].map(glyph => glyph.getAttribute('class'))

    expect(inks).toHaveLength(SCENE_TEMPLATE_IDS.length)
    inks.forEach(ink => expect(ink).toContain('text-domain-3d'))
  })
})

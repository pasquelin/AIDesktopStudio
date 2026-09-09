import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW } from '@/engines/canvas/viewport'
import type { GenerationComment } from '@/features/image/generationComments'
import { ImageDocumentComments, type ImageDocumentCommentsProps } from './ImageDocumentComments'

/** A hundred square, so a note's own coordinates read as a percentage of the image. */
const SIZE = { width: 100, height: 100 }

/**
 * The notes as the canvas draws them. The four actions travel with every note, and a case that
 * reads one back passes its own — spelling the other three out per case said nothing at all.
 */
const notes = (
  props: Partial<ImageDocumentCommentsProps> & { comments: readonly GenerationComment[] },
) => (
  <ImageDocumentComments
    view={DEFAULT_VIEW}
    size={SIZE}
    onChange={() => {}}
    onRename={() => {}}
    onRemove={() => {}}
    {...props}
  />
)

describe('image generation comment placement', () => {
  it('uses a concise prompt that remains readable inside the note', () => {
    render(notes({ comments: [{ id: 'note', at: { x: 50, y: 50 }, text: '' }] }))

    expect(screen.getByPlaceholderText('Modification à apporter…')).toBeInstanceOf(
      HTMLTextAreaElement,
    )
  })

  it('offers the active generator on a written note', () => {
    const onGenerate = vi.fn()
    render(
      notes({
        comments: [{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove the reflection' }],
        onGenerate,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Générer à partir de ce commentaire' }))

    expect(onGenerate).toHaveBeenCalledWith('note')
  })

  it('shows no generation action without an active compatible generator', () => {
    render(
      notes({ comments: [{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove the reflection' }] }),
    )

    expect(screen.queryByRole('button', { name: 'Générer à partir de ce commentaire' })).toBeNull()
  })

  it('draws outlined comments with the shared legible stroke', () => {
    const { container } = render(
      notes({
        comments: [
          {
            id: 'note',
            at: { x: 50, y: 50 },
            outline: [
              { x: 10, y: 10 },
              { x: 20, y: 20 },
            ],
            text: 'Keep this',
          },
        ],
      }),
    )

    expect(container.querySelector('polygon')).toHaveAttribute(
      'stroke-width',
      'var(--sc-comment-outline)',
    )
  })

  it('fills an outlined comment while keeping the image visible underneath', () => {
    const { container } = render(
      notes({
        comments: [
          {
            id: 'note',
            at: { x: 50, y: 50 },
            outline: [
              { x: 10, y: 10 },
              { x: 20, y: 10 },
              { x: 20, y: 20 },
            ],
            text: 'Remove this',
          },
        ],
      }),
    )

    expect(container.querySelector('polygon')).toHaveClass('fill-comment-mark-overlay')
  })

  it('keeps a note and its outline aligned while the viewport moves and zooms', () => {
    const comment = {
      id: 'note',
      at: { x: 10, y: 20 },
      outline: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      text: 'Keep this',
    }
    const { container, rerender } = render(notes({ comments: [comment] }))

    rerender(
      notes({
        comments: [comment],
        view: { ...DEFAULT_VIEW, viewport: { x: 5, y: 7, scale: 2 } },
      }),
    )

    expect(screen.getByDisplayValue('Keep this').parentElement).toHaveStyle({
      left: '25px',
      top: '47px',
    })
    // The outline is placed by a transform and its points stay in document units, so the two
    // halves are read together: 10,20 through this transform lands on the note's own 25,47.
    const outline = container.querySelector('polygon')
    expect(outline).toHaveAttribute('points', '10,20 30,40')
    expect(outline).toHaveAttribute('transform', 'translate(5 7) scale(2)')
  })

  it('opens notes inward from every image edge', () => {
    render(
      notes({
        comments: [
          { id: 'top-left', at: { x: 10, y: 10 }, text: 'Top left' },
          { id: 'top-right', at: { x: 90, y: 10 }, text: 'Top right' },
          { id: 'bottom-left', at: { x: 10, y: 90 }, text: 'Bottom left' },
          { id: 'bottom-right', at: { x: 90, y: 90 }, text: 'Bottom right' },
        ],
      }),
    )

    expect(screen.getByDisplayValue('Top left').parentElement).toHaveStyle({
      transform: 'translate(0, 0)',
    })
    expect(screen.getByDisplayValue('Top right').parentElement).toHaveStyle({
      transform: 'translate(-100%, 0)',
    })
    expect(screen.getByDisplayValue('Bottom left').parentElement).toHaveStyle({
      transform: 'translate(0, -100%)',
    })
    expect(screen.getByDisplayValue('Bottom right').parentElement).toHaveStyle({
      transform: 'translate(-100%, -100%)',
    })
  })

  it('names an area from the canvas', () => {
    const onRename = vi.fn()
    render(notes({ comments: [{ id: 'note', at: { x: 50, y: 50 }, text: '' }], onRename }))

    fireEvent.change(screen.getByPlaceholderText('Nommer…'), { target: { value: 'The sky' } })

    expect(onRename).toHaveBeenCalledWith('note', 'The sky')
  })

  it('edits a note from the canvas', () => {
    const onChange = vi.fn()
    render(notes({ comments: [{ id: 'note', at: { x: 50, y: 50 }, text: 'Before' }], onChange }))

    fireEvent.change(screen.getByDisplayValue('Before'), { target: { value: 'After' } })

    expect(onChange).toHaveBeenCalledWith('note', 'After')
  })

  it('removes a note from the canvas', () => {
    const onRemove = vi.fn()
    render(notes({ comments: [{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove me' }], onRemove }))

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le commentaire' }))

    expect(onRemove).toHaveBeenCalledWith('note')
  })

  it('renders nothing after the selected comment is removed', () => {
    const comment = {
      id: 'note',
      at: { x: 50, y: 50 },
      outline: [
        { x: 10, y: 10 },
        { x: 20, y: 10 },
        { x: 20, y: 20 },
      ],
      text: 'Remove me',
    }
    const { container, rerender } = render(notes({ comments: [comment] }))

    rerender(notes({ comments: [] }))

    expect(container.querySelector('polygon')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
  })
})

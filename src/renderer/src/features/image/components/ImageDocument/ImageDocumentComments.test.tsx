import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VIEW } from '@/engines/canvas/viewport'
import { ImageDocumentComments } from './ImageDocumentComments'

describe('image generation comment placement', () => {
  it('uses a concise prompt that remains readable inside the note', () => {
    render(
      <ImageDocumentComments
        comments={[{ id: 'note', at: { x: 50, y: 50 }, text: '' }]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )

    expect(screen.getByPlaceholderText('Modification à apporter…')).toBeInstanceOf(
      HTMLTextAreaElement,
    )
  })

  it('offers the active generator on a written note', () => {
    const onGenerate = vi.fn()
    render(
      <ImageDocumentComments
        comments={[{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove the reflection' }]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
        onGenerate={onGenerate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Générer à partir de ce commentaire' }))

    expect(onGenerate).toHaveBeenCalledWith('note')
  })

  it('shows no generation action without an active compatible generator', () => {
    render(
      <ImageDocumentComments
        comments={[{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove the reflection' }]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Générer à partir de ce commentaire' })).toBeNull()
  })

  it('draws outlined comments with the shared legible stroke', () => {
    const { container } = render(
      <ImageDocumentComments
        comments={[
          {
            id: 'note',
            at: { x: 50, y: 50 },
            outline: [
              { x: 10, y: 10 },
              { x: 20, y: 20 },
            ],
            text: 'Keep this',
          },
        ]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )

    expect(container.querySelector('polyline')).toHaveAttribute(
      'stroke-width',
      'var(--sc-comment-outline)',
    )
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
    const { container, rerender } = render(
      <ImageDocumentComments
        comments={[comment]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )

    rerender(
      <ImageDocumentComments
        comments={[comment]}
        view={{ ...DEFAULT_VIEW, viewport: { x: 5, y: 7, scale: 2 } }}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
    )

    expect(screen.getByDisplayValue('Keep this').parentElement).toHaveStyle({
      left: '25px',
      top: '47px',
    })
    expect(container.querySelector('polyline')).toHaveAttribute('points', '25,47 65,87')
  })

  it('opens notes inward from every image edge', () => {
    render(
      <ImageDocumentComments
        comments={[
          { id: 'top-left', at: { x: 10, y: 10 }, text: 'Top left' },
          { id: 'top-right', at: { x: 90, y: 10 }, text: 'Top right' },
          { id: 'bottom-left', at: { x: 10, y: 90 }, text: 'Bottom left' },
          { id: 'bottom-right', at: { x: 90, y: 90 }, text: 'Bottom right' },
        ]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={() => {}}
      />,
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

  it('edits a note from the canvas', () => {
    const onChange = vi.fn()
    render(
      <ImageDocumentComments
        comments={[{ id: 'note', at: { x: 50, y: 50 }, text: 'Before' }]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={onChange}
        onRemove={() => {}}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('Before'), { target: { value: 'After' } })

    expect(onChange).toHaveBeenCalledWith('note', 'After')
  })

  it('removes a note from the canvas', () => {
    const onRemove = vi.fn()
    render(
      <ImageDocumentComments
        comments={[{ id: 'note', at: { x: 50, y: 50 }, text: 'Remove me' }]}
        view={DEFAULT_VIEW}
        size={{ width: 100, height: 100 }}
        onChange={() => {}}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retirer le commentaire' }))

    expect(onRemove).toHaveBeenCalledWith('note')
  })
})

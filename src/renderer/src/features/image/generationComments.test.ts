import { describe, expect, it } from 'vitest'
import type { Point } from '@/engines/core/geometry'
import { DEFAULT_CANVAS, pixelLayer } from '@/engines/canvas/canvasState'
import {
  commentFor,
  generationCommentLayerId,
  generationCommentOutlines,
  promptWithComments,
  supportsGenerationComments,
  writtenGenerationComments,
} from './generationComments'

const AT: Point = { x: 40, y: 80 }

describe('generation comments', () => {
  it('refuses a schema that exposes only a mask image field', () => {
    expect(
      supportsGenerationComments([
        { key: 'prompt', kind: 'longText', label: 'Prompt', promptSpark: true, required: true },
        { key: 'mask', kind: 'image', label: 'Mask', maskFrom: 'source', required: true },
      ]),
    ).toBe(false)
  })

  it('anchors a comment to the active layer', () => {
    expect(commentFor('note-1', AT, 'layer-car')).toEqual({
      id: 'note-1',
      at: AT,
      text: '',
      layerId: 'layer-car',
    })
  })

  it('keeps a comment global when no layer is active', () => {
    expect(commentFor('note-1', AT, null)).toEqual({ id: 'note-1', at: AT, text: '' })
  })

  it('adds a lasso note to the model prompt without changing the original request', () => {
    const prompt = promptWithComments(
      'A wooden crate',
      [
        {
          id: 'note-1',
          at: AT,
          text: 'Extract this car',
          outline: [AT, { x: 80, y: 80 }, { x: 80, y: 120 }],
        },
      ],
      { width: 200, height: 200 },
    )

    expect(prompt).toBe(
      'A wooden crate\n\nImage comments:\n1. Extract this car (whole image, outlined area, anchored at 20% × 40%)',
    )
  })

  it('ignores empty notes when preparing a generation', () => {
    expect(
      writtenGenerationComments([
        { id: 'empty', at: AT, text: '  ' },
        { id: 'written', at: AT, text: 'Keep this' },
      ]).map(comment => comment.id),
    ).toEqual(['written'])
  })

  it('isolates one layer only when every written note targets it', () => {
    const comments = [
      { id: 'one', at: AT, text: 'First', layerId: 'car' },
      { id: 'two', at: AT, text: 'Second', layerId: 'car' },
    ]

    expect(generationCommentLayerId(comments)).toBe('car')
    expect(
      generationCommentLayerId([...comments, { id: 'global', at: AT, text: 'Whole image' }]),
    ).toBeNull()
  })

  it('keeps each layer target explicit when the full document must be captured', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      width: 200,
      height: 200,
      layers: [pixelLayer('car', 'Car'), pixelLayer('sky', 'Sky')],
    }

    expect(
      promptWithComments(
        'Improve the image',
        [
          { id: 'one', at: AT, text: 'Extract it', layerId: 'car' },
          { id: 'two', at: AT, text: 'Brighten it', layerId: 'sky' },
        ],
        canvas,
      ),
    ).toContain('Extract it (layer "Car", anchored at 20% × 40%)')
  })

  it('keeps a global target explicit beside a layer target', () => {
    const canvas = {
      ...DEFAULT_CANVAS,
      width: 200,
      height: 200,
      layers: [pixelLayer('car', 'Car')],
    }

    expect(
      promptWithComments(
        'Improve the image',
        [
          { id: 'layer', at: AT, text: 'Extract it', layerId: 'car' },
          { id: 'global', at: AT, text: 'Warm the scene' },
        ],
        canvas,
      ),
    ).toContain('Warm the scene (whole image, anchored at 20% × 40%)')
  })

  it('keeps each outlined region as its own mask polygon', () => {
    const first = [AT, { x: 60, y: 80 }, { x: 60, y: 100 }]
    const second = [
      { x: 100, y: 100 },
      { x: 120, y: 100 },
      { x: 120, y: 120 },
    ]

    expect(
      generationCommentOutlines([
        { id: 'one', at: AT, text: 'First', outline: first },
        { id: 'pin', at: AT, text: 'Pin only' },
        { id: 'two', at: AT, text: 'Second', outline: second },
      ]),
    ).toEqual([first, second])
  })
})

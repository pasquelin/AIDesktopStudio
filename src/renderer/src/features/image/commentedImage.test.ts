import { describe, expect, it, vi } from 'vitest'
import type { FieldDescriptor } from '@shared/domain/model'
import { prepareCommentedImage } from './commentedImage'

const FIELDS: readonly FieldDescriptor[] = [
  { key: 'prompt', kind: 'longText', label: 'Prompt', promptSpark: true, required: true },
  { key: 'source', kind: 'image', label: 'Source', required: false },
  { key: 'mask', kind: 'image', label: 'Mask', maskFrom: 'source', required: false },
]

describe('a commented image prepared for generation', () => {
  it('sends the common target layer and the traced region to the model fields', async () => {
    const upload = vi.fn(async (name: string) => `uploaded-${name}`)
    const host = {
      snapshot: async () => 'DOCUMENT',
      layerSnapshot: async () => 'LAYER',
      outlineMaskSnapshot: async () => 'MASK',
    }

    const prepared = await prepareCommentedImage(
      { prompt: 'Change it' },
      FIELDS,
      [
        {
          id: 'note-1',
          at: { x: 10, y: 20 },
          text: 'Remove this',
          layerId: 'car',
          outline: [
            { x: 10, y: 20 },
            { x: 30, y: 20 },
            { x: 30, y: 40 },
          ],
        },
      ],
      host,
      upload,
      'document',
    )

    expect(prepared).toEqual({
      consumed: true,
      values: {
        prompt: 'Change it',
        source: 'uploaded-document-layer.png',
        mask: 'uploaded-document-comments-mask.png',
      },
    })
    expect(upload).toHaveBeenNthCalledWith(1, 'document-layer.png', 'LAYER')
    expect(upload).toHaveBeenNthCalledWith(2, 'document-comments-mask.png', 'MASK')
  })

  it('uses the full document when notes do not share one layer', async () => {
    const upload = vi.fn(async () => 'uploaded-document')
    const host = {
      snapshot: async () => 'DOCUMENT',
      layerSnapshot: async () => 'LAYER',
      outlineMaskSnapshot: async () => null,
    }

    await prepareCommentedImage(
      {},
      FIELDS,
      [
        { id: 'layer', at: { x: 1, y: 1 }, text: 'Layer', layerId: 'car' },
        { id: 'global', at: { x: 2, y: 2 }, text: 'Global' },
      ],
      host,
      upload,
      'document',
    )

    expect(upload).toHaveBeenCalledWith('document.png', 'DOCUMENT')
  })

  it('does not capture or upload an empty post-it', async () => {
    const snapshot = vi.fn(async () => 'DOCUMENT')
    const upload = vi.fn(async () => 'uploaded-document')

    const prepared = await prepareCommentedImage(
      { prompt: 'Keep it' },
      FIELDS,
      [{ id: 'empty', at: { x: 1, y: 1 }, text: '  ' }],
      {
        snapshot,
        layerSnapshot: async () => null,
        outlineMaskSnapshot: async () => null,
      },
      upload,
      'document',
    )

    expect(prepared).toEqual({ values: { prompt: 'Keep it' }, consumed: false })
    expect(snapshot).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not consume comments when the schema has no source image field', async () => {
    const snapshot = vi.fn(async () => 'DOCUMENT')
    const upload = vi.fn(async () => 'uploaded-document')

    const prepared = await prepareCommentedImage(
      { prompt: 'Keep it' },
      [
        { key: 'prompt', kind: 'longText', label: 'Prompt', promptSpark: true, required: true },
        { key: 'mask', kind: 'image', label: 'Mask', maskFrom: 'source', required: true },
      ],
      [{ id: 'note', at: { x: 1, y: 1 }, text: 'Change this area' }],
      {
        snapshot,
        layerSnapshot: async () => null,
        outlineMaskSnapshot: async () => null,
      },
      upload,
      'document',
    )

    expect(prepared).toEqual({ values: { prompt: 'Keep it' }, consumed: false })
    expect(snapshot).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it('never lets the open-canvas placeholder reach a provider', async () => {
    const prepared = await prepareCommentedImage(
      { prompt: 'Keep it', source: 'canvas:document' },
      FIELDS,
      [],
      {
        snapshot: async () => null,
        layerSnapshot: async () => null,
        outlineMaskSnapshot: async () => null,
      },
      async () => 'unused',
      'document',
    )

    expect(prepared).toEqual({ values: { prompt: 'Keep it' }, consumed: false })
  })

  it('keeps prompt text that starts like the open-canvas placeholder', async () => {
    const prepared = await prepareCommentedImage(
      { prompt: 'canvas: make it warmer', source: 'canvas:document' },
      FIELDS,
      [],
      {
        snapshot: async () => null,
        layerSnapshot: async () => null,
        outlineMaskSnapshot: async () => null,
      },
      async () => 'unused',
      'document',
    )

    expect(prepared).toEqual({
      values: { prompt: 'canvas: make it warmer' },
      consumed: false,
    })
  })
})

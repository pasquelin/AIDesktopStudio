import { beforeEach, describe, expect, it } from 'vitest'
import { aiRoleId } from '@shared/domain/aiRole'
import { CODE_API_FIELD, CODE_SOURCE_FIELD } from '@shared/domain/codeGeneration'
import { documentFolderOf } from '@shared/domain/document'
import { useCode } from '@/stores/code'
import { installDocument } from '@/stores/document-fixtures'
import { useDocuments } from '@/stores/documents'
import type { FieldDescriptor } from '@shared/domain/model'
import { DEFAULT_CANVAS } from '@/engines/canvas/canvasState'
import { canvasStore } from '@/stores/canvases'
import { installIn } from '@/stores/document-fixtures'
import { withBodyExtras } from './bodyExtras'
import { useGenerationComments } from '@/stores/generationComments'

// Where `installDocument` files a script — read off the domain, never spelt out: the folder is
// the user's to rename, and a literal here would pin the test to today's default.
const WALK = `script:${documentFolderOf('script')}/doc-1.ts`

const CODE2CODE = aiRoleId('code', 'code2code')
const TXT2CODE = aiRoleId('code', 'txt2code')
const TXT2IMG = aiRoleId('image', 'txt2img')
const IMG2VIDEO = aiRoleId('video', 'img2video')

/** The field the API itself marks — never one guessed at by name, which lands in the negative. */
const PROMPT: FieldDescriptor[] = [
  { key: 'prompt', kind: 'longText', label: 'Prompt', required: true, promptSpark: true },
]
const IMAGE_SOURCE: FieldDescriptor = {
  key: 'image',
  kind: 'image',
  label: 'Image',
  required: true,
}

const onGrid = (cell: number | null): void =>
  installIn(
    canvasStore,
    'doc-image',
    { ...DEFAULT_CANVAS, width: 512, height: 512, pixelCell: cell },
    'image',
  )

beforeEach(() => {
  useDocuments.setState({ documents: {}, activeId: null })
  useCode.setState({ files: {}, problems: [], goto: null })
  useGenerationComments.setState({ comments: {} })
})

describe('what a family adds to a generation beyond the form', () => {
  it('sends the script in front, which no model schema can publish', () => {
    installDocument('doc-1', 'code')
    useCode.getState().installed(WALK, 'export const x = 1')

    const body = withBodyExtras(CODE2CODE, { prompt: 'a spin' })

    expect(body[CODE_SOURCE_FIELD]).toBe('export const x = 1')
    // 🛑 The declaration travels with it: the main process cannot inline it — see `CODE_API_FIELD`.
    expect(body[CODE_API_FIELD]).toContain('declare module')
  })

  /** 🛑 Absent, not empty: an empty string is a script that says nothing. */
  it('sends no source when no script is in front', () => {
    expect(withBodyExtras(CODE2CODE, { prompt: 'a spin' })[CODE_SOURCE_FIELD]).toBeUndefined()
  })

  /**
   * 🛑 The operation decides, not the tab in front: a `txt2code` carrying the open script had the
   * model rework it while the answer landed in a new file — the two decisions at odds.
   */
  it('sends no source for an operation that takes none, script in front or not', () => {
    installDocument('doc-1', 'code')
    useCode.getState().installed(WALK, 'export const x = 1')

    expect(withBodyExtras(TXT2CODE, { prompt: 'a spin' })[CODE_SOURCE_FIELD]).toBeUndefined()
  })

  it('leaves the form alone for an image that is not on a pixel grid', () => {
    onGrid(null)

    expect(withBodyExtras(TXT2IMG, { prompt: 'a cat' }, { fields: PROMPT })).toEqual({
      prompt: 'a cat',
    })
  })

  it('sends image notes with a compatible generation form', () => {
    onGrid(null)
    useGenerationComments.getState().add('doc-image', {
      id: 'note-1',
      at: { x: 128, y: 256 },
      text: 'Keep the car still',
    })

    expect(
      withBodyExtras(IMG2VIDEO, { prompt: 'Drive away' }, { fields: [...PROMPT, IMAGE_SOURCE] }),
    ).toEqual({
      prompt:
        'Drive away\n\nImage comments:\n1. Keep the car still (whole image, anchored at 25% × 50%)',
    })
  })

  it('keeps spatial comments out of a schema that only exposes a mask field', () => {
    onGrid(null)
    useGenerationComments.getState().add('doc-image', {
      id: 'note-1',
      at: { x: 128, y: 256 },
      text: 'Keep the car still',
    })

    expect(
      withBodyExtras(
        IMG2VIDEO,
        { prompt: 'Drive away' },
        {
          fields: [
            ...PROMPT,
            { key: 'mask', kind: 'image', label: 'Mask', maskFrom: 'image', required: true },
          ],
        },
      ),
    ).toEqual({ prompt: 'Drive away' })
  })

  // The grid is what the studio holds and no model schema publishes — the whole reason for the table.
  it('says the grid after the subject on a pixel-art document', () => {
    onGrid(16)

    expect(withBodyExtras(TXT2IMG, { prompt: 'a knight' }, { fields: PROMPT })).toEqual({
      prompt: 'a knight, pixel art, 32x32 sprite, hard edges, no anti-aliasing',
    })
  })

  // The box exists so a studio on a grid can still ask for a photo reference without leaving
  // the mode, which would resize the document and drop its pixel history.
  it('leaves the form alone once the box is unticked', () => {
    onGrid(16)

    expect(
      withBodyExtras(TXT2IMG, { prompt: 'a knight' }, { fields: PROMPT, pixelArt: false }),
    ).toEqual({ prompt: 'a knight' })
  })

  /** An upscale has no prompt at all, and guessing a field by name is how one lands in the wrong. */
  it('leaves a model with no prompt field of its own alone', () => {
    onGrid(16)

    expect(withBodyExtras(TXT2IMG, { image: 'asset-1' }, { fields: [] })).toEqual({
      image: 'asset-1',
    })
  })

  /** The home asks with no family at all — it browses no catalogue and generates nothing. */
  it('leaves the form alone with no family', () => {
    expect(withBodyExtras(null, { prompt: 'a cat' })).toEqual({ prompt: 'a cat' })
  })
})

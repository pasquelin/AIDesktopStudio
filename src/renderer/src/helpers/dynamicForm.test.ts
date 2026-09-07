import { describe, expect, it } from 'vitest'
import type { FieldDescriptor } from '@shared/domain/model'
import {
  buildBody,
  defaultValues,
  groupFields,
  referencePictures,
  visibleFields,
} from './dynamicForm'
import { field } from './dynamic-form-fixtures'

describe('a field that holds several values', () => {
  // `''` is neither what its control writes back nor what its schema accepts.
  it('opens on an empty list rather than on a blank', () => {
    const fields = [field({ key: 'files', kind: 'image', repeated: true })]

    expect(defaultValues(fields)).toEqual({ files: [] })
  })

  // Prompt assistance saw no reference picture at all on a multiview.
  it('offers every picture it holds as a reference, not only the first', () => {
    const fields = [field({ key: 'files', kind: 'image', repeated: true })]

    expect(referencePictures(fields, { files: ['asset_7', 'asset_8'] })).toEqual([
      'asset_7',
      'asset_8',
    ])
  })
})

describe('default values', () => {
  /**
   * 🛑 Two models sharing a key share nothing else: a scheduler the next one does not list would
   * render a `<select>` on no option at all, and a required field then reads empty in silence.
   */
  it('leaves behind a carried value the new model cannot hold', () => {
    const field: FieldDescriptor = {
      key: 'scheduler',
      kind: 'choice',
      label: 'Scheduler',
      required: true,
      default: 'Euler',
      options: [{ value: 'Euler', label: 'Euler' }],
    }

    expect(defaultValues([field], undefined, { scheduler: 'DPM++ 2M' })).toEqual({
      scheduler: 'Euler',
    })
  })

  // A knob carried past the new model's bounds fails validation on a field nobody ever touched.
  it('leaves behind a number the new model puts out of range', () => {
    const field: FieldDescriptor = {
      key: 'steps',
      kind: 'integer',
      label: 'Steps',
      required: false,
      default: 25,
      min: 1,
      max: 30,
    }

    expect(defaultValues([field], undefined, { steps: 80 })).toEqual({ steps: 25 })
  })
  /**
   * 🛑 What the panel FILLED is not what the person typed. Carried alike, a source withdrawn from
   * the panel above came straight back into the request it had just left — the list said one
   * thing about what would be sent, the form below it said another.
   */
  it('drops a carried value the last preset had put there, and keeps a typed one', () => {
    const image = field({ key: 'image' })

    expect(defaultValues([image], undefined, { image: 'asset-1' }, { image: 'asset-1' })).toEqual({
      image: '',
    })
    expect(defaultValues([image], undefined, { image: 'typed' }, { image: 'asset-1' })).toEqual({
      image: 'typed',
    })
  })

  /**
   * 🛑 Only the SOURCES may be dropped this way. Told the whole preset instead, this blanked a
   * prompt « regenerate with these parameters » had prefilled, the moment picking an image
   * changed the operation and took the stored preset with it — § 22's own case, undone.
   */
  it('keeps what no source ever put there', () => {
    expect(defaultValues([field({ key: 'mask' })], undefined, { mask: 'drawn' }, {})).toEqual({
      mask: 'drawn',
    })
    expect(defaultValues([field({ key: 'prompt' })], undefined, { prompt: 'a cat' }, {})).toEqual({
      prompt: 'a cat',
    })
  })

  it('uses what the model published, and a blank otherwise', () => {
    expect(
      defaultValues([
        field({ key: 'steps', kind: 'integer', default: 28 }),
        field({ key: 'prompt' }),
        field({ key: 'hires', kind: 'boolean' }),
      ]),
    ).toEqual({ steps: 28, prompt: '', hires: false })
  })
})

describe('dependencies', () => {
  const fields = [
    field({ key: 'mode', kind: 'choice' }),
    field({ key: 'strength', dependsOn: { key: 'mode', value: 'img2img' } }),
  ]

  it('hides a field whose dependency is unmet', () => {
    expect(visibleFields(fields, { mode: 'txt2img' }).map(item => item.key)).toEqual(['mode'])
  })

  it('shows it once the dependency is satisfied', () => {
    expect(visibleFields(fields, { mode: 'img2img' }).map(item => item.key)).toEqual([
      'mode',
      'strength',
    ])
  })
})

describe('body building', () => {
  it('drops what was left empty rather than sending a blank', () => {
    const body = buildBody([field({ key: 'prompt' }), field({ key: 'negative' })], {
      prompt: 'a rock',
      negative: '',
    })

    expect(body).toEqual({ prompt: 'a rock' })
  })

  it('drops a hidden field even when it still holds a value', () => {
    const fields = [
      field({ key: 'mode', kind: 'choice' }),
      field({ key: 'strength', kind: 'number', dependsOn: { key: 'mode', value: 'img2img' } }),
    ]

    expect(buildBody(fields, { mode: 'txt2img', strength: 0.7 })).toEqual({ mode: 'txt2img' })
  })

  it('keeps a false boolean, which is a value and not an absence', () => {
    expect(buildBody([field({ key: 'hires', kind: 'boolean' })], { hires: false })).toEqual({
      hires: false,
    })
  })

  it('keeps a zero, which is a value and not an absence', () => {
    expect(buildBody([field({ key: 'seed', kind: 'seed' })], { seed: 0 })).toEqual({ seed: 0 })
  })
})

describe('grouping', () => {
  it('keeps the order the model published, ungrouped fields first', () => {
    const grouped = groupFields([
      field({ key: 'prompt' }),
      field({ key: 'steps', group: 'Advanced' }),
      field({ key: 'seed', group: 'Advanced' }),
    ])

    expect(grouped.map(([name, items]) => [name, items.map(item => item.key)])).toEqual([
      ['', ['prompt']],
      ['Advanced', ['steps', 'seed']],
    ])
  })
})

describe('referencePictures', () => {
  it('does not expose the open-canvas placeholder as an uploaded reference', () => {
    expect(
      referencePictures([{ key: 'image', kind: 'image', label: 'Image', required: true }], {
        image: 'canvas:doc-1',
      }),
    ).toEqual([])
  })

  const picture = (key: string): FieldDescriptor => ({
    key,
    kind: 'image',
    label: key,
    required: false,
  })

  it('collects the picture fields the user filled, in declaration order', () => {
    const fields = [
      picture('reference'),
      field({ key: 'prompt', kind: 'longText' }),
      picture('mask'),
    ]

    expect(
      referencePictures(fields, { reference: 'asset_one', prompt: 'a boulder', mask: 'asset_two' }),
    ).toEqual(['asset_one', 'asset_two'])
  })

  it('skips the ones left empty', () => {
    const fields = [picture('reference'), picture('mask')]

    expect(referencePictures(fields, { reference: 'asset_one', mask: '   ' })).toEqual([
      'asset_one',
    ])
  })

  it('answers nothing when the model takes no picture', () => {
    const fields = [field({ key: 'prompt', kind: 'longText' })]

    expect(referencePictures(fields, { prompt: 'a boulder' })).toEqual([])
  })
})

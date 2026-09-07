import { describe, expect, it } from 'vitest'
import type { FieldDescriptor, FieldKind } from '@shared/domain/model'
import { adoptableParameters } from './callParameters'

function field(
  key: string,
  kind: FieldKind,
  extra: Partial<FieldDescriptor> = {},
): FieldDescriptor {
  return { key, kind, label: key, required: false, ...extra }
}

const PROMPT_SPARK_FIELDS = [
  field('prompt', 'longText'),
  field('videoFps', 'number', { min: 0.1, max: 24 }),
  field('aspectRatio', 'choice', {
    options: [
      { value: '3:2', label: '3:2' },
      { value: '21:9', label: '21:9' },
    ],
  }),
  field('resolution', 'choice', {
    options: [
      { value: '1K', label: '1K' },
      { value: '4K', label: '4K' },
    ],
  }),
  field('useGoogleSearch', 'boolean'),
  field('thinkingLevel', 'choice', {
    options: [
      { value: 'LOW', label: 'LOW' },
      { value: 'HIGH', label: 'HIGH' },
    ],
  }),
  field('numOutputs', 'integer', { min: 1, max: 4 }),
  field('seed', 'seed', { min: 0, max: 2147483647 }),
]

describe('adoptableParameters', () => {
  it('keeps only the keys the model declares', () => {
    const fields = [field('prompt', 'longText'), field('resolution', 'choice')]

    const adopted = adoptableParameters(
      { prompt: 'a boulder', resolution: '4K', invented: 'nope' },
      fields,
    )

    expect(adopted).toEqual({ prompt: 'a boulder', resolution: '4K' })
  })

  it('answers nothing when the proposal is not an object', () => {
    const fields = [field('prompt', 'longText')]

    expect(adoptableParameters(undefined, fields)).toEqual({})
    expect(adoptableParameters(null, fields)).toEqual({})
    expect(adoptableParameters('prompt', fields)).toEqual({})
    expect(adoptableParameters(['prompt'], fields)).toEqual({})
  })

  it('answers nothing when the model declares no field', () => {
    expect(adoptableParameters({ prompt: 'a boulder' }, [])).toEqual({})
  })

  describe('per kind', () => {
    it('takes a boolean only for a boolean', () => {
      const fields = [field('useGoogleSearch', 'boolean')]

      expect(adoptableParameters({ useGoogleSearch: true }, fields)).toEqual({
        useGoogleSearch: true,
      })
      expect(adoptableParameters({ useGoogleSearch: 'true' }, fields)).toEqual({})
      expect(adoptableParameters({ useGoogleSearch: 1 }, fields)).toEqual({})
    })

    it('takes a whole number for an integer, and refuses a fractional one', () => {
      const fields = [field('numOutputs', 'integer', { min: 1, max: 4 })]

      expect(adoptableParameters({ numOutputs: 2 }, fields)).toEqual({ numOutputs: 2 })
      expect(adoptableParameters({ numOutputs: 2.5 }, fields)).toEqual({})
    })

    it('takes a fractional number for a number', () => {
      const fields = [field('videoFps', 'number', { min: 0.1, max: 24 })]

      expect(adoptableParameters({ videoFps: 1.5 }, fields)).toEqual({ videoFps: 1.5 })
    })

    it('refuses what is not a finite number', () => {
      const fields = [field('videoFps', 'number')]

      expect(adoptableParameters({ videoFps: Number.NaN }, fields)).toEqual({})
      expect(adoptableParameters({ videoFps: Number.POSITIVE_INFINITY }, fields)).toEqual({})
      expect(adoptableParameters({ videoFps: '2' }, fields)).toEqual({})
    })

    it('takes a seed, which is a whole number like any other', () => {
      const fields = [field('seed', 'seed', { min: 0, max: 2147483647 })]

      expect(adoptableParameters({ seed: 869979916 }, fields)).toEqual({ seed: 869979916 })
      expect(adoptableParameters({ seed: -1 }, fields)).toEqual({})
      expect(adoptableParameters({ seed: 1.5 }, fields)).toEqual({})
    })

    it('takes a choice the model published, and refuses one it did not', () => {
      const fields = [
        field('resolution', 'choice', {
          options: [
            { value: '1K', label: '1K' },
            { value: '4K', label: '4K' },
          ],
        }),
      ]

      expect(adoptableParameters({ resolution: '4K' }, fields)).toEqual({ resolution: '4K' })
      expect(adoptableParameters({ resolution: '8K' }, fields)).toEqual({})
      expect(adoptableParameters({ resolution: 4 }, fields)).toEqual({})
    })

    it('takes any string for a choice with no published option', () => {
      const fields = [field('style', 'choice')]

      expect(adoptableParameters({ style: 'anything' }, fields)).toEqual({ style: 'anything' })
    })

    it('takes a string for the text-shaped kinds', () => {
      const kinds: FieldKind[] = ['text', 'longText', 'color', 'image']

      for (const kind of kinds) {
        const fields = [field('value', kind)]
        expect(adoptableParameters({ value: 'something' }, fields)).toEqual({ value: 'something' })
        expect(adoptableParameters({ value: 12 }, fields)).toEqual({})
      }
    })

    // `raw` renders as a plain text input, which would show an object as `[object Object]`.
    it('takes only what a plain input can hold for an unknown kind', () => {
      const fields = [field('mystery', 'raw')]

      expect(adoptableParameters({ mystery: 'text' }, fields)).toEqual({ mystery: 'text' })
      expect(adoptableParameters({ mystery: 3 }, fields)).toEqual({ mystery: 3 })
      expect(adoptableParameters({ mystery: true }, fields)).toEqual({ mystery: true })
      expect(adoptableParameters({ mystery: { nested: 1 } }, fields)).toEqual({})
      expect(adoptableParameters({ mystery: [1, 2] }, fields)).toEqual({})
    })
  })

  describe('bounds', () => {
    it('drops a value the model would refuse rather than clamping it', () => {
      const fields = [field('numOutputs', 'integer', { min: 1, max: 4 })]

      expect(adoptableParameters({ numOutputs: 9 }, fields)).toEqual({})
      expect(adoptableParameters({ numOutputs: 0 }, fields)).toEqual({})
    })

    it('accepts the bounds themselves', () => {
      const fields = [field('numOutputs', 'integer', { min: 1, max: 4 })]

      expect(adoptableParameters({ numOutputs: 1 }, fields)).toEqual({ numOutputs: 1 })
      expect(adoptableParameters({ numOutputs: 4 }, fields)).toEqual({ numOutputs: 4 })
    })

    it('accepts anything finite when the model published no bound', () => {
      const fields = [field('scale', 'number')]

      expect(adoptableParameters({ scale: -1000 }, fields)).toEqual({ scale: -1000 })
    })
  })

  // Measured on `model_google-gemini-3-1-flash`: the proposal carries every setting the model
  // declares, including one that only applies to another input it also accepts.
  it('takes a real Prompt Spark proposal whole', () => {
    const adopted = adoptableParameters(
      {
        prompt: 'Photorealistic close-up of a large, weathered mossy boulder',
        videoFps: 1,
        aspectRatio: '3:2',
        resolution: '4K',
        useGoogleSearch: true,
        thinkingLevel: 'HIGH',
        numOutputs: 1,
        seed: 869979916,
      },
      PROMPT_SPARK_FIELDS,
    )

    expect(adopted).toEqual({
      prompt: 'Photorealistic close-up of a large, weathered mossy boulder',
      videoFps: 1,
      aspectRatio: '3:2',
      resolution: '4K',
      useGoogleSearch: true,
      thinkingLevel: 'HIGH',
      numOutputs: 1,
      seed: 869979916,
    })
  })
})

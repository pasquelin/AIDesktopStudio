import { describe, expect, it } from 'vitest'
import { ADVANCED_GROUP } from '@shared/domain/localFields'
import { SKYBOX_TAG } from '@shared/domain/model'
import { familyOf, translateSchema, type ProviderInput } from './schema'

describe('translateSchema', () => {
  it('turns a bounded integer into an integer field', () => {
    const [field] = translateSchema([
      { name: 'numInferenceSteps', type: 'number', min: 1, max: 50, step: 1, default: 28 },
    ])
    expect(field).toMatchObject({
      key: 'numInferenceSteps',
      kind: 'integer',
      min: 1,
      max: 50,
      step: 1,
      default: 28,
    })
  })

  it('turns a fractional step into a real number', () => {
    const [field] = translateSchema([
      { name: 'guidance', type: 'number', step: 0.5, min: 1, max: 10 },
    ])
    expect(field?.kind).toBe('number')
  })

  it('turns a string with allowed values into a dropdown', () => {
    const [field] = translateSchema([
      { name: 'aspectRatio', type: 'string', allowedValues: ['1:1', '16:9'] },
    ])
    expect(field?.kind).toBe('choice')
    expect(field?.options).toEqual([
      { value: '1:1', label: '1:1' },
      { value: '16:9', label: '16:9' },
    ])
  })

  it('tells prompt, color and plain text apart', () => {
    const fields = translateSchema([
      { name: 'prompt', type: 'string', prompt: true },
      { name: 'background', type: 'string', color: true },
      { name: 'title', type: 'string' },
    ])
    expect(fields.map(field => field.kind)).toEqual(['longText', 'color', 'text'])
  })

  describe('the field prompt assistance rewrites', () => {
    it('takes the API at its word when it marks one', () => {
      const [field] = translateSchema([
        { name: 'prompt', type: 'string', prompt: true, promptSpark: true },
      ])
      expect(field?.promptSpark).toBe(true)
    })

    it('falls back to the prompt field on a model that marks only that', () => {
      const [field] = translateSchema([{ name: 'prompt', type: 'string', prompt: true }])
      expect(field?.promptSpark).toBe(true)
    })

    it('leaves every other field unmarked', () => {
      const fields = translateSchema([
        { name: 'title', type: 'string' },
        { name: 'steps', type: 'number' },
      ])
      expect(fields.every(field => field.promptSpark === undefined)).toBe(true)
    })
  })

  it('recognizes the seed by its name', () => {
    const [field] = translateSchema([{ name: 'seed', type: 'number' }])
    expect(field?.kind).toBe('seed')
  })

  it('treats an image file as an image, a 3D file as a mesh, and the rest as raw', () => {
    const fields = translateSchema([
      { name: 'image', type: 'file', kind: 'image' },
      { name: 'characterFile', type: 'file', kind: '3d' },
      { name: 'doc', type: 'file', kind: 'document' },
    ])
    expect(fields.map(field => field.kind)).toEqual(['image', 'mesh', 'raw'])
  })
})

describe('translateSchema metadata', () => {
  it('carries the size limit a file input names', () => {
    const fields = translateSchema([
      { name: 'characterFile', type: 'file', kind: '3d', maxSize: 30000000 },
    ])
    expect(fields[0]?.maxSize).toBe(30000000)
  })

  it('carries which field moves the price, and leaves the rest unmarked', () => {
    const fields = translateSchema([
      { name: 'animation', type: 'string', costImpact: true },
      { name: 'includeRiggedModel', type: 'boolean' },
    ])
    expect(fields.map(field => field.costImpact)).toEqual([true, undefined])
  })

  it('falls back to raw input on an unknown type instead of dropping the field', () => {
    const fields = translateSchema([{ name: 'whatever', type: 'unknown-type' }])
    expect(fields).toHaveLength(1)
    expect(fields[0]?.kind).toBe('raw')
  })

  it('makes an API name readable when no label is provided', () => {
    const [field] = translateSchema([{ name: 'numInferenceSteps', type: 'number' }])
    expect(field?.label).toBe('Num inference steps')
  })

  describe('field metadata', () => {
    it('prefers the label provided by the model', () => {
      const [field] = translateSchema([
        { name: 'numInferenceSteps', type: 'number', label: 'Steps' },
      ])
      expect(field?.label).toBe('Steps')
    })

    it('marks a field required only when the rule is "always"', () => {
      const fields = translateSchema([
        { name: 'a', type: 'string', required: { always: true } },
        { name: 'b', type: 'string', required: {} },
        { name: 'c', type: 'string' },
      ])
      expect(fields.map(field => field.required)).toEqual([true, false, false])
    })

    it('accepts a complete absence of inputs', () => {
      expect(translateSchema(undefined)).toEqual([])
    })

    it('does not invent a missing default value', () => {
      const [field] = translateSchema([{ name: 'a', type: 'string' }])
      expect(field).not.toHaveProperty('default')
    })

    it('keeps every input, unknown ones included', () => {
      const inputs: ProviderInput[] = [
        { name: 'a', type: 'string' },
        { name: 'b', type: 'inputs_array' },
        { name: 'c', type: 'model' },
      ]
      expect(translateSchema(inputs)).toHaveLength(3)
    })
  })
})

describe('familyOf', () => {
  it('classifies an image-to-video model as video, not image', () => {
    expect(familyOf(['img2video', 'txt2video'], [])).toBe('video')
  })

  it('recognizes 3D, audio and image', () => {
    expect(familyOf(['img23d'], [])).toBe('3d')
    expect(familyOf(['txt2audio'], [])).toBe('audio')
    expect(familyOf(['txt2img', 'inpaint'], [])).toBe('image')
  })

  // The API tells textures apart from images by capability, and the Materials workspace is only
  // its own section as long as this classification is too.
  it('files a material model under its own family, not under image', () => {
    expect(familyOf(['txt2img_texture'], [])).toBe('material')
    expect(familyOf(['img2img_texture'], [])).toBe('material')
    expect(familyOf(['reference_texture'], [])).toBe('material')
    expect(familyOf(['controlnet_texture'], [])).toBe('material')
  })

  it('falls back to "other" with no usable capability', () => {
    expect(familyOf([], [])).toBe('other')
    expect(familyOf(undefined, [])).toBe('other')
    expect(familyOf(['txt2txt'], [])).toBe('other')
  })

  /**
   * The real capabilities of `model_scenario-llm`, read from the account on 10 August 2026: it is
   * the one public model that produces text, and it declares `img2txt` alongside. `img` matches
   * the image pattern, so without a rule on the output the Image workspace listed a model that
   * writes prose. Checked against a listing of the first 100 public models — no image model
   * declares `img2txt`, so keying on the output cannot misfile one.
   */
  it('files a model that produces text under "other", whatever it reads', () => {
    expect(familyOf(['txt2txt', 'img2txt'], [])).toBe('other')
    expect(familyOf(['img2txt'], [])).toBe('other')
  })

  // The three public skybox models answer `txt2img`/`img2img` like any image model, so the
  // capabilities alone put them in the wrong workspace. Only the tag tells them apart.
  it('classifies a tagged panorama model as skybox, not image', () => {
    expect(familyOf(['txt2img', 'img2img'], [SKYBOX_TAG])).toBe('skybox')
    expect(familyOf(['img2img'], ['panorama', '360', SKYBOX_TAG])).toBe('skybox')
  })

  it('leaves an untagged image model where it was', () => {
    expect(familyOf(['txt2img'], ['panorama'])).toBe('image')
    expect(familyOf(['txt2img'], [])).toBe('image')
  })

  // Scenario Skybox Upscale, the fourth model of the space, carries `skybox-upscale` and no
  // `SKYBOX_TAG` — so the tag that defines the family does not name it, and the space listed
  // three of the four skyboxes the catalogue holds. `image-upscale` is a different tag and
  // stays a different family: measured 2026-08-15, no model carries both.
  it('claims a skybox upscaler, which no capability and no namespaced tag names', () => {
    expect(familyOf(['img2img'], ['sc:scenario', 'skybox-upscale'])).toBe('skybox')
    expect(familyOf(['img2img'], ['image-upscale'])).toBe('upscale')
  })
})

describe('familyOf image edits', () => {
  // The capability enum holds no upscale, no cutout and no vectorize value — measured against
  // `models.list`'s own — and all 26 of these models answer `img2img`. The tag is the only
  // signal, exactly as for skyboxes.
  it('tells the three edit families apart from plain image models', () => {
    expect(familyOf(['img2img'], ['image-upscale'])).toBe('upscale')
    expect(familyOf(['img2img'], ['remove-background'])).toBe('background-removal')
    expect(familyOf(['img2img'], ['vectorize'])).toBe('vectorization')
  })

  // Two of the nine models carrying `remove-background` are video models. Refining from the
  // capabilities rather than from the tag alone is what keeps them out of the canvas's cutout.
  it('leaves a video background remover under video', () => {
    expect(familyOf(['video2video'], ['remove-background'])).toBe('video')
  })

  // VecGlypher answers `txt2img` and produces an SVG: it is a vectorizer that takes no picture,
  // and the family is what it makes, not what it is fed.
  it('claims a text-to-image vectorizer', () => {
    expect(familyOf(['txt2img'], ['vectorize'])).toBe('vectorization')
  })

  /**
   * Two of these tags on one model have no right answer — they name different outputs. The
   * table's order decides, so the answer is at least stable: the tag order the API happens to
   * serve would not be.
   */
  it('settles a model carrying two family tags by the table, not by the API', () => {
    expect(familyOf(['img2img'], ['vectorize', 'image-upscale'])).toBe('upscale')
    expect(familyOf(['img2img'], ['image-upscale', 'vectorize'])).toBe('upscale')
  })

  /**
   * An author's tag is trusted only once the capabilities have vouched for it, so a model that
   * declares none stays unclassified. `sc:skybox` is the exception, and deliberately: it comes
   * from Scenario's own namespace, where nobody else can post it.
   */
  it('does not classify by an author tag alone when a model declares no capability', () => {
    expect(familyOf([], ['remove-background'])).toBe('other')
    expect(familyOf(undefined, [SKYBOX_TAG])).toBe('skybox')
  })

  /**
   * `generate.run_model` calls it "the name of the file input field to use as the mask source".
   * Carried through so an edit action can fill the picture and its mask without naming either
   * model's field — which is what keeps invariant 5 whole for inpainting.
   */
  it('carries the field a mask input masks', () => {
    const inputs: ProviderInput[] = [
      { name: 'image', type: 'file', kind: 'image' },
      { name: 'mask', type: 'file', kind: 'image', maskFrom: 'image' },
    ]

    expect(translateSchema(inputs).map(field => field.maskFrom)).toEqual([undefined, 'image'])
  })
})

describe('what a first generation never touches', () => {
  const inputOf = (over: Partial<ProviderInput> & { name: string }): ProviderInput => ({
    type: 'string',
    ...over,
  })

  // Told by a KIND of ours and by the field that names what it masks — the two contractual signals.
  it('folds the seed and the mask, whatever the model calls them', () => {
    const fields = translateSchema([
      inputOf({ name: 'seed', type: 'integer' }),
      inputOf({ name: 'whatever', type: 'image', maskFrom: 'image' }),
    ])

    expect(fields.map(one => one.group)).toEqual([ADVANCED_GROUP, ADVANCED_GROUP])
  })

  // Spelled either way: the same knob is `cfg_scale` on one model and `cfgScale` on the next.
  it('folds the knobs whichever way the catalogue spells them', () => {
    const fields = translateSchema([
      inputOf({ name: 'negative_prompt' }),
      inputOf({ name: 'cfgScale', type: 'float' }),
      inputOf({ name: 'num_inference_steps', type: 'integer' }),
    ])

    expect(fields.every(one => one.group === ADVANCED_GROUP)).toBe(true)
  })

  // What the generation is ABOUT, and what it consumes, stay in plain sight.
  it('leaves the prompt and the picture it works from unfolded', () => {
    const fields = translateSchema([
      inputOf({ name: 'prompt' }),
      inputOf({ name: 'image', type: 'image' }),
    ])

    expect(fields.map(one => one.group)).toEqual([undefined, undefined])
  })

  // A model that groups its own inputs is obeyed: the default only fills a silence.
  it('never overrides a group the model declared itself', () => {
    const [field] = translateSchema([inputOf({ name: 'seed', type: 'integer', group: 'Sampling' })])

    expect(field?.group).toBe('Sampling')
  })
})

import { describe, expect, it } from 'vitest'
import {
  assetTypeOfModality,
  localFieldKeys,
  localFieldsOf,
  LOCAL_MODALITIES,
  outputExtensionOf,
  producesFile,
} from './localFields'

const shout = (key: string): string => key.toUpperCase()

describe('localFieldsOf', () => {
  // Invariant 5: no generation form is written by hand. A Scenario model publishes its inputs; a
  // model on this machine has no server to ask, so the modality answers for it.
  it('offers a text model the knobs a text model has', () => {
    const keys = localFieldsOf('text', {}, shout).map(field => field.key)

    expect(keys).toEqual(['prompt', 'temperature', 'topP', 'maxTokens', 'seed'])
  })

  it('offers an image model its own, and the prompt both share', () => {
    const keys = localFieldsOf('image', {}, shout).map(field => field.key)

    expect(keys).toContain('steps')
    expect(keys).toContain('cfgScale')
    expect(keys[0]).toBe('prompt')
  })

  // The label is screen text, and `no-hardcoded-text` is right to refuse one written in a module.
  it('translates every label rather than carrying one', () => {
    for (const field of localFieldsOf('text', {}, shout)) {
      expect(field.label).toBe(field.label.toUpperCase())
      expect(field.label).not.toBe('')
    }
  })

  /**
   * What a manifest is FOR: a model disagrees with its modality on a bound or a default, never on
   * which knobs exist. A model that added one would be a model its runtime could not honour.
   */
  it('lets a manifest move a default without moving the form', () => {
    const tuned = localFieldsOf('image', { steps: { default: 4, max: 8 } }, shout)
    const steps = tuned.find(field => field.key === 'steps')

    expect(steps?.default).toBe(4)
    expect(steps?.max).toBe(8)
    expect(tuned.map(field => field.key)).toEqual(localFieldsOf('image', {}, shout).map(f => f.key))
  })

  it('leaves a field alone when the manifest names another', () => {
    const tuned = localFieldsOf('image', { steps: { default: 4 } }, shout)

    expect(tuned.find(field => field.key === 'cfgScale')?.default).toBe(7)
  })
})

describe('localFieldKeys', () => {
  // Read off the templates rather than recopied: a knob added without its word would put a raw
  // key on the form, which is the costliest defect this repository knows.
  it('names every key a bundle owes, help included', () => {
    const keys = localFieldKeys()

    expect(keys).toContain('localFields.prompt')
    expect(keys).toContain('localFields.seedHelp')
    expect(new Set(keys).size).toBe(new Set(keys).size)
  })
})

describe('the modalities that write a file', () => {
  const producing = LOCAL_MODALITIES.filter(producesFile)

  it('gives every one of them a prompt, whatever it produces', () => {
    for (const modality of LOCAL_MODALITIES) {
      expect(localFieldsOf(modality, {}, shout).map(field => field.key)).toContain('prompt')
    }
  })

  it('counts frames and a rate for a video, where an image has neither', () => {
    const keys = localFieldsOf('video', {}, shout).map(field => field.key)

    expect(keys).toEqual(expect.arrayContaining(['frames', 'fps', 'image']))
    expect(localFieldsOf('image', {}, shout).map(field => field.key)).not.toContain('frames')
  })

  it('asks a sound how long it runs, and for lyrics ACE-Step 1.5 takes', () => {
    const keys = localFieldsOf('audio', {}, shout).map(field => field.key)

    expect(keys).toEqual(expect.arrayContaining(['seconds', 'lyrics', 'video']))
    expect(keys).not.toContain('negativePrompt')
  })

  it('lets a mesh skip the description when a picture is there', () => {
    const prompt = localFieldsOf('mesh', {}, shout).find(field => field.key === 'prompt')

    expect(prompt?.required).toBe(false)
  })

  // Measured 2026-08-22 against `ShapEPipeline.__call__`: it takes neither a size nor a negative
  // prompt, and a knob a pipeline refuses is a form that fails at the first generation.
  it('offers a mesh neither a size nor a negative prompt', () => {
    const keys = localFieldsOf('mesh', {}, shout).map(field => field.key)

    for (const absent of ['width', 'height', 'negativePrompt']) expect(keys).not.toContain(absent)
  })

  // A motion is the one that is not named after its shelf: it is filed as an animation, which is
  // what the studio calls a clip. Every other modality still answers itself.
  it('files each of them on the shelf its name says, a motion apart', () => {
    for (const modality of producing.filter(one => one !== 'motion'))
      expect(assetTypeOfModality(modality)).toBe(modality)
    expect(assetTypeOfModality('motion')).toBe('animation')
  })

  // The collector files by modality. A skybox is a panorama PNG — the same suffix as an image,
  // a different shelf. A video written as `.png` is the case this still refuses.
  it('writes a clip, a take and a mesh under a suffix nothing else uses', () => {
    expect(outputExtensionOf('image')).toBe('png')
    expect(outputExtensionOf('skybox')).toBe('png')
    expect(outputExtensionOf('video')).toBe('mp4')
    expect(outputExtensionOf('audio')).toBe('wav')
    expect(outputExtensionOf('mesh')).toBe('ply')
    expect(outputExtensionOf('motion')).toBe('glb')
  })

  it('opens a skybox on a 2:1 frame, which a still does not', () => {
    const fields = localFieldsOf('skybox', {}, shout)
    expect(fields.find(field => field.key === 'width')?.default).toBe(2048)
    expect(fields.find(field => field.key === 'height')?.default).toBe(1024)
    expect(localFieldsOf('image', {}, shout).find(field => field.key === 'width')?.default).toBe(
      1024,
    )
  })

  it('leaves a conversation writing no file at all', () => {
    expect(producesFile('text')).toBe(false)
  })
})

describe('a default that cannot be typed back in', () => {
  /**
   * The form renders a real `<input type="number">` with `min`/`max`/`step`, and a browser
   * refuses to submit a `stepMismatch` — a default off its own grid is a generation that never
   * starts, and nothing on screen says why.
   */
  it('puts every numeric default on the grid its own step draws', () => {
    const offGrid = LOCAL_MODALITIES.flatMap(modality =>
      localFieldsOf(modality, {}, shout)
        .filter(field => typeof field.default === 'number' && field.step && field.min !== undefined)
        // Within a hair of the grid rather than on it: 0.95 from 0 by 0.05 leaves 0.049999… in
        // binary floating point, and a browser tolerates exactly that.
        .filter(field => {
          const step = Number(field.step)
          const off = (Number(field.default) - Number(field.min)) % step
          return Math.min(Math.abs(off), Math.abs(step - off)) > 1e-9
        })
        .map(field => `${modality}.${field.key}`),
    )

    expect(offGrid).toEqual([])
  })

  // 🛑 A seed is 32 bits unsigned: the local motion engine raises on anything wider, and nothing
  // on the `generate` path was catching it — the job simply failed.
  it('bounds every seed field to what a seed IS, rather than leaving it open', () => {
    const seeds = localFieldsOf('motion', {}, key => key).filter(field => field.kind === 'seed')

    expect(seeds).not.toHaveLength(0)
    for (const field of seeds) expect(field).toMatchObject({ min: 0, max: 2 ** 32 - 1 })
  })
})

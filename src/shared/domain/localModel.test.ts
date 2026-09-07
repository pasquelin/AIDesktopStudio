import { describe, expect, it } from 'vitest'
import {
  admitsLoad,
  licenceAdmitted,
  modelRefusalOf,
  needsOwnFolder,
  provenanceUnverified,
  sourceOf,
  type ModelFormat,
  type ModelLoader,
} from './localModel'
import { localModel } from './localModel-fixtures'

describe('sourceOf', () => {
  it('groups by rank and loader rather than by a stored kind', () => {
    expect(sourceOf(localModel())).toBe('studio')
    expect(sourceOf(localModel({ loader: 'ollama', format: 'gguf' }))).toBe('ollama')
    expect(sourceOf(localModel({ rank: 3 }))).toBe('custom')
  })
})

describe('admitsLoad', () => {
  // ADR-20 § A: the whitelist is written on PAIRS, because what makes the studio's ONNX safe is a
  // measured property of its loader — not a property of the format.
  it('admits ONNX for the loader it was measured on, and no other', () => {
    expect(admitsLoad('onnx', 'sherpa-onnx')).toBe(true)
    expect(admitsLoad('onnx', 'ollama')).toBe(false)
    expect(admitsLoad('onnx', 'llamacpp')).toBe(false)
  })

  // Refused, and not "with a warning": pickle executes arbitrary code at read time, and an
  // opt-out that can be configured is one that gets disarmed in silence.
  it('refuses pickle for every loader that does not use weights_only', () => {
    const loaders: readonly ModelLoader[] = ['sherpa-onnx', 'ollama', 'llamacpp', 'diffusers']

    for (const loader of loaders) expect(admitsLoad('pickle', loader)).toBe(false)
  })

  it('admits pickle for the plugin adapter, which loads with weights_only', () => {
    expect(admitsLoad('pickle', 'plugin')).toBe(true)
    expect(admitsLoad('safetensors', 'plugin')).toBe(true)
  })

  it('admits the formats designed not to execute anything', () => {
    const formats: readonly ModelFormat[] = ['safetensors', 'gguf']

    for (const format of formats) expect(admitsLoad(format, 'llamacpp')).toBe(true)
  })
})

describe('modelRefusalOf', () => {
  it('lets through a shipped model whose pair is admitted', () => {
    expect(modelRefusalOf(localModel())).toBeNull()
  })

  it('refuses a distribution-blocked model independently of files on disk', () => {
    expect(modelRefusalOf(localModel({ distributionStatus: 'blocked' }))).toBe(
      'distribution-blocked',
    )
  })

  it('refuses a pair the whitelist does not admit', () => {
    expect(modelRefusalOf(localModel({ format: 'pickle' }))).toBe('format-not-admitted')
    expect(modelRefusalOf(localModel({ format: 'onnx', loader: 'ollama' }))).toBe(
      'format-not-admitted',
    )
  })

  /**
   * ADR-20 § B as amended: supplying one's own manifest is admitted under an EXPLICIT gesture, and
   * that gesture exists. What rank 3 earns is a mark — never a refusal, which used to make the
   * rank unreachable and every model of it read as incompatible.
   */
  it('admits a manifest the person supplied, and marks it', () => {
    expect(modelRefusalOf(localModel({ rank: 3 }))).toBeNull()
    expect(provenanceUnverified(localModel({ rank: 3 }))).toBe(true)
    expect(provenanceUnverified(localModel({ rank: 1 }))).toBe(false)
  })

  // The whitelist is what decides, and it decides for the person's own file exactly as it does
  // for a shipped one: pointing at something is not a reason to open it.
  it('refuses a format the loader does not admit, whoever supplied it', () => {
    expect(modelRefusalOf(localModel({ rank: 3, format: 'pickle' }))).toBe('format-not-admitted')
  })
})

describe('a manifest that names code beside the weights', () => {
  /**
   * Measured 2026-08-22: on a local folder whose architecture Transformers knows,
   * `from_pretrained` runs a `.py` sitting beside the weights without asking, and
   * `trust_remote_code=False` does not fire. The whitelist is written on (format, loader) and
   * cannot see a file, so this is the only place such an entry is stopped.
   */
  it('is refused whatever its format and loader', () => {
    const model = localModel({
      format: 'safetensors',
      loader: 'diffusers',
      files: [
        { role: 'weights', name: 'model.safetensors', url: 'u', bytes: 1, sha256: 'a' },
        { role: 'code', name: 'custom_model.py', url: 'u', bytes: 1, sha256: 'b' },
      ],
    })

    expect(modelRefusalOf(model)).toBe('weights-carry-code')
  })

  it('is refused for a compiled module as much as for a source one', () => {
    for (const name of ['pipeline.pyc', 'fast.so', 'helper.dylib', 'plugin.dll', 'run.PY']) {
      const model = localModel({
        format: 'safetensors',
        loader: 'diffusers',
        files: [{ role: 'weights', name, url: 'u', bytes: 1, sha256: 'a' }],
      })

      expect(modelRefusalOf(model)).toBe('weights-carry-code')
    }
  })

  it('admits weights and their configuration', () => {
    const model = localModel({
      format: 'safetensors',
      loader: 'diffusers',
      files: [
        {
          role: 'weights',
          name: 'transformer/diffusion_pytorch_model.safetensors',
          url: 'u',
          bytes: 1,
          sha256: 'a',
        },
        { role: 'config', name: 'model_index.json', url: 'u', bytes: 1, sha256: 'b' },
        { role: 'tokenizer', name: 'tokenizer/tokenizer.model', url: 'u', bytes: 1, sha256: 'c' },
      ],
    })

    expect(modelRefusalOf(model)).toBeNull()
  })
})

describe('needsOwnFolder', () => {
  it('gives folder trees their own directory, and file loaders the shared one', () => {
    expect(needsOwnFolder('diffusers')).toBe(true)
    expect(needsOwnFolder('plugin')).toBe(true)
    expect(needsOwnFolder('llamacpp')).toBe(false)
    expect(needsOwnFolder('sherpa-onnx')).toBe(false)
  })
})

describe('licenceAdmitted', () => {
  it('admits the licences that permit redistribution and commercial use', () => {
    for (const licence of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'CC-BY-4.0']) {
      expect(licenceAdmitted(localModel({ licence }))).toBe(true)
    }
  })

  // A LIST of what is admitted: written the other way round, every licence nobody thought to
  // exclude walks in — which is how OpenRAIL, the Gemma terms and `other` would enter.
  it('refuses what the policy does not name, whatever the download weighs', () => {
    for (const licence of ['creativeml-openrail-m', 'gemma', 'other', 'CC-BY-NC-4.0', '']) {
      expect(licenceAdmitted(localModel({ licence }))).toBe(false)
    }
  })

  it('refuses a model the catalogue offers under a licence off the list', () => {
    expect(modelRefusalOf(localModel({ licence: 'gemma' }))).toBe('licence-not-admitted')
  })

  // The person's OWN file, already on their disk: the studio neither fetched it nor vouches for
  // it, and refusing it would be the studio deciding what someone may open locally.
  it('leaves a supplied file alone, whose licence nobody here can know', () => {
    expect(licenceAdmitted(localModel({ rank: 3, licence: '' }))).toBe(true)
  })
})

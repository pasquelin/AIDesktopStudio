import { describe, expect, it } from 'vitest'
import {
  aiRoleId,
  allRoles,
  ASSISTANT_ROLE,
  AUTO_RIG_ROLE,
  DICTATION_ROLE,
  partsOfRole,
  type AiRoleId,
} from '@shared/domain/aiRole'
import { isAutoRigBackendId } from '@shared/domain/autoRig'
import { STT_MODEL } from '@shared/domain/dictation'
import type { LocalModel } from '@shared/domain/localModel'
import licences from '@shared/licences.json'
import {
  catalogueRefusals,
  modelsForWith,
  modelWith,
  rolesServedBy,
  rolesWithLocalOption,
  shippedModel,
  shippedModels,
  shippedModelsFor,
} from './catalogue'
import { ollamaModel } from '@shared/domain/ollamaModel'

describe('the shipped catalogue', () => {
  // ADR-20 § A puts the whitelist at the point of INSTALL, and the catalogue is where a model
  // enters the studio. A guard rather than a comment, so a model added later cannot slip past.
  it('holds nothing the whitelist refuses', () => {
    expect(catalogueRefusals()).toEqual([])
  })

  /**
   * ADR-20 § E asks that a licence travel WITH the weights. `collect-licences.mjs` cannot read
   * these manifests — it strips types and resolves no `@shared/` alias, and says so — so the
   * notices are retyped there by hand. This is what makes the omission redden: a third model
   * added without its line ships with no attribution, and no gate would have said a word.
   */
  it('gives every shipped model its line in the collected notices', () => {
    const collected = new Map(licences.map(entry => [entry.name, entry.spdx]))

    for (const model of shippedModels()) {
      expect(collected.get(model.name), `${model.name} has no notice`).toBe(model.licence)
    }
  })

  /**
   * 🛑 The JSON's keys are cast to `AiRoleId` and trusted. A key nobody declared — a typo, or an
   * employment added to the data and not to `aiRole.ts` — files a model under a role no screen
   * ever offers, and NOTHING else would say so.
   */
  it('files every shipped model under a role the studio actually has', () => {
    expect(rolesWithLocalOption().filter(role => !allRoles().includes(role))).toEqual([])
  })

  it('serves the recognition model to the dictation role', () => {
    expect(shippedModelsFor(DICTATION_ROLE)).toEqual([STT_MODEL])
  })

  // Several, from the lightest up: what a machine can hold is the person's call, so the catalogue
  // offers a range rather than one entry chosen for them.
  it('offers the assistant a range of models this studio can run itself', () => {
    const loaders = new Set(shippedModelsFor(ASSISTANT_ROLE).map(model => model.loader))

    expect(shippedModelsFor(ASSISTANT_ROLE).length).toBeGreaterThan(1)
    expect([...loaders]).toEqual(['llamacpp'])
  })

  /**
   * The two roles no catalogue entry can be missing FIRST, whatever else grows beside them: a
   * pinned list would go red at every role added, which says nothing about either of these.
   */
  it('serves the two roles that came before any generation did', () => {
    expect(rolesWithLocalOption()).toContain(DICTATION_ROLE)
    expect(rolesWithLocalOption()).toContain(ASSISTANT_ROLE)
  })

  // Several, from the lightest up, for the reason the assistant already has: what a machine can
  // hold is the person's call, and one entry chosen for them is not a choice.
  it('offers an image role a range of models that generate rather than converse', () => {
    const image = shippedModelsFor(aiRoleId('image', 'txt2img'))

    expect(image.length).toBeGreaterThan(1)
    expect(new Set(image.map(model => model.modality))).toEqual(new Set(['image']))
  })

  // Lightest first, because the FIRST usable entry is what a role takes on its own. Every role
  // and not the assistant alone: the one pinned to a role went green on the day a second one
  // gained a second model, and said nothing about it.
  it('orders each role from the lightest model up', () => {
    for (const role of rolesWithLocalOption()) {
      const sizes = shippedModelsFor(role).map(model => model.diskBytes)

      expect(sizes, role).toEqual([...sizes].sort((one, other) => one - other))
    }
  })

  /**
   * The figure a disk verdict and the size on screen are both read from. A model that ships a file
   * list must agree with it — `diskBytes` is declared rather than summed only because a
   * runtime-pulled model has no list here, and the two must not drift for the ones that do.
   */
  it('declares on disk exactly what the files it ships weigh', () => {
    const drifted = shippedModels()
      .filter(model => model.files.length > 0)
      .filter(model => model.diskBytes !== model.files.reduce((sum, file) => sum + file.bytes, 0))

    expect(drifted).toEqual([])
  })

  /**
   * A conversation needs a window, and the brain reads it to decide what to trim. Without one it
   * would fall back on Ollama's own 2048, and the studio's preamble would be cut from the HEAD.
   */
  it('gives every model that answers the assistant a context window', () => {
    const windowless = shippedModelsFor(ASSISTANT_ROLE).filter(
      model => model.contextTokens === undefined,
    )

    expect(windowless).toEqual([])
  })

  it('finds a model by the id its manifest carries', () => {
    expect(shippedModel(STT_MODEL.id)).toBe(STT_MODEL)
  })

  // Ids come from manifests, including ones a person supplies, so an unknown id is expected
  // rather than exceptional.
  it('answers nothing for an id it does not ship', () => {
    expect(shippedModel('not-a-shipped-model')).toBeNull()
  })

  it('opens every generating model rather than leaving it plugin-required', () => {
    const closed = shippedModels()
      .filter(model => model.modality && model.modality !== 'text')
      .filter(
        model =>
          model.runtimeStatus === 'plugin-required' && model.distributionStatus !== 'blocked',
      )
      .map(model => model.id)

    expect(closed).toEqual([])
  })
})

describe('the shipped generation catalogue', () => {
  it('lists the five panorama models under the skybox employments', () => {
    expect(shippedModelsFor(aiRoleId('skybox', 'txt2skybox')).map(model => model.id)).toEqual([
      'panfusion',
      'mvdiffusion',
      'unipano',
      'diffusion360',
    ])
    expect(shippedModelsFor(aiRoleId('skybox', 'img2skybox')).map(model => model.id)).toEqual([
      'genex-world-initializer',
    ])
  })

  it('opens every skybox model, so both employments have an engine that can run', () => {
    const closed = shippedModels()
      .filter(model => model.family === 'skybox')
      .filter(model => model.runtimeStatus === 'unsupported' || model.files.length === 0)
      .map(model => model.id)

    expect(closed).toEqual([])
  })

  // A digest nobody can fetch is worse than no download: the engine is a later lot.
  it('ships no files for a generating model no engine can open', () => {
    const offered = shippedModels()
      .filter(model => model.runtimeStatus === 'unsupported' && model.files.length > 0)
      .map(model => model.id)

    expect(offered).toEqual([])
  })

  /**
   * Hunyuan3D's community licence excludes the EU, the UK and South Korea. Listing it here would
   * present a download the studio itself has no permission to offer from this territory.
   */
  it('does not list a 3d model whose licence excludes this territory', () => {
    const excluded = shippedModels()
      .filter(model => model.family === '3d')
      .filter(model => model.licenceStatus === 'unsupported-region' || /hunyuan/i.test(model.id))
      .map(model => model.id)

    expect(excluded).toEqual([])
  })

  it('opens TripoSG as a CUDA plugin with pinned files', () => {
    const model = shippedModel('triposg')

    expect(model?.loader).toBe('plugin')
    expect(model?.needsCuda).toBe(true)
    expect(model?.files.length).toBeGreaterThan(0)
    expect(model?.runtimeStatus).not.toBe('unsupported')
  })

  it('offers the advanced Auto Rig with its five pinned checkpoints', () => {
    const model = shippedModel('make-it-animatable')

    expect(shippedModelsFor(aiRoleId('3d', 'rig'))).toEqual([model])
    expect(model?.files.map(file => file.name)).toEqual([
      'bw.pth',
      'bw_normal.pth',
      'joints.pth',
      'joints_coarse.pth',
      'pose.pth',
    ])
    expect(
      model?.files.every(file => file.revision === 'eb12b71253361fd1a7216625a95144af3c58263e'),
    ).toBe(true)
    expect(model?.diskBytes).toBe(2_330_090_627)
    expect(model?.needsCuda).not.toBe(true)
  })

  it('opens InstantMesh as a CUDA plugin, its unet standing in for zero123plus own', () => {
    const model = shippedModel('instantmesh')

    expect(model?.loader).toBe('plugin')
    expect(model?.needsCuda).toBe(true)
    expect(model?.runtimeStatus).toBeUndefined()
    expect(model?.files.map(file => file.name)).toContain('unet/diffusion_pytorch_model.bin')
  })

  it('opens LGM as a CUDA plugin that writes a Gaussian cloud', () => {
    const model = shippedModel('lgm')

    expect(model?.loader).toBe('plugin')
    expect(model?.needsCuda).toBe(true)
    expect(model?.runtimeStatus).toBeUndefined()
    expect(model?.files.map(file => file.name)).toContain('lgm/model_fp16_fixrot.safetensors')
  })

  it('leaves no 3d card the engine cannot open', () => {
    const closed = shippedModels()
      .filter(model => model.family === '3d')
      .filter(model => model.runtimeStatus === 'unsupported')
      .map(model => model.id)

    expect(closed).toEqual([])
  })

  it('states the OpenRAIL terms CraftsMan3D actually ships under', () => {
    const model = shippedModel('craftsman3d')

    expect(model?.licence).toBe('CreativeML Open RAIL-M')
    expect(model?.needsCuda).toBe(true)
    expect(model?.licenceStatus).toBe('restricted')
    expect(model?.files.map(file => file.name)).toContain('model.ckpt')
  })

  it('lists commercially licensed 3d engines beside the ones already wired', () => {
    expect(shippedModelsFor(aiRoleId('3d', 'img23d')).map(model => model.id)).toEqual(
      expect.arrayContaining(['triposr', 'instantmesh', 'triposg', 'craftsman3d', 'lgm']),
    )
  })

  it('gives every 3d model a year and a line that says more than its name', () => {
    const models = shippedModels().filter(model => model.family === '3d')
    const thin = models
      .filter(model => !model.releasedAt || !model.summary || model.summary === model.name)
      .map(model => model.id)
    // The year lives in `releasedAt`; restating it in the line would show twice on screen.
    const restated = models
      .filter(model => /^\d{4} · /.test(model.summary ?? ''))
      .map(model => model.id)

    expect(thin).toEqual([])
    expect(restated).toEqual([])
  })

  it('gives every generating model a family and a capability', () => {
    const bare = shippedModels()
      .filter(model => model.modality && model.modality !== 'text')
      .filter(model => !model.family || !model.capabilities?.length)
      .map(model => model.id)

    expect(bare).toEqual([])
  })
})

describe('models discovered at runtime', () => {
  it('offers a discovered chat model to the assistant and not to drawing', () => {
    const qwen = ollamaModel({ name: 'qwen3:8b', size: 5_000_000_000 })
    expect(qwen).not.toBeNull()
    if (!qwen) return

    expect(modelsForWith(ASSISTANT_ROLE, [], [qwen]).map(model => model.id)).toContain('qwen3:8b')
    expect(modelsForWith(aiRoleId('image', 'txt2img'), [], [qwen])).not.toContainEqual(qwen)
    expect(modelWith('qwen3:8b', [], [qwen])).toBe(qwen)
  })

  /**
   * 🛑 A discovered tag declares NO family and NO capabilities, so `serves` was read inside a
   * branch it never reached: the field was dead for exactly the models it exists for, and an
   * Ollama conversation that writes scripts was offered to the assistant alone.
   */
  it('offers a discovered chat model the employments its manifest says it serves', () => {
    const qwen = ollamaModel({ name: 'qwen2.5-coder:7b', size: 5_000_000_000 })
    expect(qwen).not.toBeNull()
    if (!qwen) return

    expect(qwen.family).toBeUndefined()
    for (const capability of ['txt2code', 'code2code']) {
      expect(
        modelsForWith(aiRoleId('code', capability), [], [qwen]).map(model => model.id),
      ).toContain('qwen2.5-coder:7b')
    }
  })

  it('offers a discovered image tag to drawing, not to the assistant', () => {
    const flux = ollamaModel({
      name: 'x/flux2-klein',
      size: 8_000_000_000,
      capabilities: ['image'],
    })
    expect(flux).not.toBeNull()
    if (!flux) return

    expect(
      modelsForWith(aiRoleId('image', 'txt2img'), [], [flux]).map(model => model.id),
    ).toContain('x/flux2-klein')
    expect(modelsForWith(ASSISTANT_ROLE, [], [flux])).not.toContainEqual(flux)
    expect(modelsForWith(aiRoleId('video', 'txt2video'), [], [flux])).not.toContainEqual(flux)
  })

  it('lists every shipped model once', () => {
    const models = shippedModels()

    expect(models).toContain(STT_MODEL)
    expect(new Set(models.map(model => model.id)).size).toBe(models.length)
  })
})

describe('one entry, several employments', () => {
  /**
   * `img2img` and `inpaint` run on the weights `txt2img` already downloaded. Three entries would
   * fetch the same 4.47 GB three times, show three cards, and let deleting one take the other
   * two's files — what tells the three apart is the FORM, never a second manifest.
   */
  it('serves editing and repainting from the entry that serves drawing', () => {
    const idsFor = (capability: string) =>
      shippedModelsFor(aiRoleId('image', capability)).map(model => model.id)

    for (const capability of ['txt2img', 'img2img', 'inpaint', 'outpaint']) {
      expect(idsFor(capability), capability).toContain('ssd-1b')
    }
    // And a material is an image: the same weights, filed on another shelf.
    expect(shippedModelsFor(aiRoleId('material', 'txt2img_texture')).length).toBeGreaterThan(0)
  })

  it('lists a model that serves three employments once, not three times', () => {
    const ids = shippedModels().map(model => model.id)

    expect(ids.filter(id => id === 'ssd-1b')).toEqual(['ssd-1b'])
  })
})

describe('how many employments one download answers for', () => {
  /**
   * The catalogue holds more models than employments, and the difference between them is not
   * quality: one entry serves six for 4.47 GB where another serves one for 133. The figure is
   * said on screen so the choice can be made on it — it ranks nothing.
   */
  it('counts every employment a model is filed under', () => {
    expect(rolesServedBy('ssd-1b')).toBeGreaterThan(1)
    expect(rolesServedBy('ssd-1b')).toBe(
      allRoles().filter(role => shippedModelsFor(role).some(model => model.id === 'ssd-1b')).length,
    )
  })

  it('answers nothing for a model the catalogue does not ship', () => {
    expect(rolesServedBy('not-a-shipped-model')).toBe(0)
  })
})

describe('what a manifest owes the panel', () => {
  /**
   * 🛑 Measured 2026-08-22, and it cost a request to the API: without a family,
   * `localSummaryOf` answers null, `describedLocally` fell through, and a LOCAL model id was sent
   * to Scenario — `404 Model ssd-1b not found`, journalled as a generation failure. Fifteen of
   * twenty-nine entries were in that state. The registry no longer falls through, and this keeps
   * the manifests themselves honest: a model filed under an employment says which one.
   */
  it('gives every generation model the family and capability its employment names', () => {
    const naked = allRoles()
      .flatMap(role => shippedModelsFor(role).map(model => ({ role, model })))
      .filter(({ role, model }) => partsOfRole(role) !== null && !servesTheRole(model, role))
      .map(({ role, model }) => `${model.id} under ${role}`)

    expect(naked).toEqual([])
  })

  /**
   * 🛑 `backendId` is the ENGINE's plugin id, shared with motion, and the studio implements only
   * `AUTO_RIG_BACKEND_IDS` of them for rigging. A rig entry naming another was offered in the
   * service field and answered `Unknown Auto Rig backend`, read on screen as « le squelettage
   * avancé n'a pas pu terminer » — every gate green.
   */
  it('names an Auto Rig backend the studio implements, on every rig model it ships', () => {
    const stranded = shippedModelsFor(AUTO_RIG_ROLE)
      .filter(model => !isAutoRigBackendId(model.backendId))
      .map(model => `${model.id} runs on ${model.backendId ?? 'no backend'}`)

    expect(stranded).toEqual([])
  })
})

/** Whether the manifest itself says it serves this employment, rather than the JSON key alone. */
function servesTheRole(model: LocalModel, role: AiRoleId): boolean {
  const parts = partsOfRole(role)
  if (!parts) return false

  const withinFamily = model.family === parts.family && (model.capabilities ?? []).length > 0
  return withinFamily || (model.serves ?? []).includes(role)
}

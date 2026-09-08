import { describe, expect, it } from 'vitest'
import { CLOUD_IDS, cloudsServing } from '@shared/domain/aiCloud'
import type { MemorySnapshot } from '@shared/domain/aiMemory'
import {
  aiRoleId,
  ASSISTANT_ROLE,
  DICTATION_ROLE,
  type AiRoleId,
  type RoleChoices,
} from '@shared/domain/aiRole'
import { GIBI, localModel } from '@shared/domain/localModel-fixtures'
import type { HardwareFacts } from './hardwareProbe'
import { aiOverviewOf, cudaUsableWith, type OverviewInput } from './overview'

const FACTS: HardwareFacts = {
  platform: 'linux',
  arch: 'x64',
  cpuCount: 8,
  physicalBytes: 96 * GIBI,
  freeBytes: 34 * GIBI,
  diskFreeBytes: 500 * GIBI,
  gpu: { vendorId: null, deviceId: null, renderer: 'Apple M2 Max', machineModel: null },
  vram: null,
}

const SNAPSHOT: MemorySnapshot = {
  domain: 'unified',
  source: 'probe',
  at: 0,
  physicalBytes: 96 * GIBI,
  appBudgetBytes: 48 * GIBI,
  rendererReservedBytes: GIBI,
  runtimeBytes: {},
  headroomBytes: 2 * GIBI,
  availableBytes: 34 * GIBI,
}

const PARAKEET = localModel()

const input = (over: Partial<OverviewInput> = {}): OverviewInput => ({
  facts: FACTS,
  snapshot: SNAPSHOT,
  choices: {},
  projectChoices: {},
  projectPath: null,
  modelsFor: role => (role === DICTATION_ROLE ? [PARAKEET] : []),
  isInstalled: () => true,
  isLoaded: () => false,
  isHoldable: () => true,
  runtimeReady: () => true,
  rolesServedBy: () => 1,
  readyClouds: [],
  installing: null,
  loading: null,
  loadFailure: null,
  installFailure: null,
  ollamaReady: false,
  ollamaInstalled: false,
  ollamaNames: [],
  ollamaProgress: null,
  ollamaFailed: false,
  engineKnown: false,
  engineMissing: [],
  engineTorchCuda: null,
  engineProgress: null,
  engineFailed: false,
  ...over,
})

const rowOf = (overview: ReturnType<typeof aiOverviewOf>, role: AiRoleId) =>
  overview.roles.find(row => row.role === role)

describe('aiOverviewOf', () => {
  /**
   * Twenty-one rows, most of them empty, would bury the two that answer. A role with no
   * candidate and no account has nothing to offer and nothing to explain.
   */
  it('says whether Ollama is on this computer and which models it listed', () => {
    expect(aiOverviewOf(input()).ollama).toEqual({
      ready: false,
      installed: false,
      names: [],
      progress: null,
      failed: false,
    })
    expect(
      aiOverviewOf(
        input({
          ollamaReady: true,
          ollamaInstalled: true,
          ollamaNames: ['alpha:1', 'beta:2'],
        }),
      ).ollama,
    ).toEqual({
      ready: true,
      installed: true,
      names: ['alpha:1', 'beta:2'],
      progress: null,
      failed: false,
    })
  })

  it('keeps only the employments something could serve', () => {
    const overview = aiOverviewOf(input())

    expect(overview.roles.map(row => row.role)).toEqual([DICTATION_ROLE])
  })

  it('hides a model whose runtime is not answering, rather than sending the person to start it', () => {
    const ollama = localModel({
      id: 'qwen3:8b',
      format: 'gguf',
      loader: 'ollama',
      files: [],
    })
    const overview = aiOverviewOf(
      input({
        modelsFor: role => (role === ASSISTANT_ROLE ? [ollama] : []),
        runtimeReady: () => false,
        isInstalled: () => false,
      }),
    )

    expect(rowOf(overview, ASSISTANT_ROLE)).toBeUndefined()
  })

  it('offers every employment once an account could answer for them', () => {
    const overview = aiOverviewOf(input({ readyClouds: CLOUD_IDS }))

    expect(rowOf(overview, ASSISTANT_ROLE)?.candidates).toEqual([])
    expect(rowOf(overview, aiRoleId('image', 'inpaint'))?.clouds).toEqual(['scenario'])
  })

  /**
   * Holding a key is not an endpoint behind it, and no branch says so: a cloud is offered where
   * it DECLARES serving the role, and the screen said "Scenario" over dictation until it did.
   */
  it('offers a cloud only where the registry says it serves the role', () => {
    const overview = aiOverviewOf(input({ readyClouds: CLOUD_IDS, isInstalled: () => false }))

    expect(rowOf(overview, DICTATION_ROLE)?.clouds).toEqual([])
    expect(rowOf(overview, DICTATION_ROLE)?.provider).toBeNull()
  })

  // A cloud held but not registered serves nothing: the registry decides, not the credentials.
  it('offers no cloud the registry does not hold', () => {
    const overview = aiOverviewOf(input({ readyClouds: ['nowhere'] }))

    expect(rowOf(overview, ASSISTANT_ROLE)).toBeUndefined()
  })

  // The window explains the verdict and the main process decides it, so what the reason NAMES
  // travels with it: `insufficient-memory` covers a full disk as much as a small machine.
  it('sends what the verdict names, beside the verdict', () => {
    const overview = aiOverviewOf(
      input({
        modelsFor: () => [localModel({ id: 'hidream', reservationBytes: 48 * GIBI })],
        isInstalled: () => false,
      }),
    )

    expect(rowOf(overview, DICTATION_ROLE)?.candidates[0]).toMatchObject({
      fit: 'insufficient-memory',
      obstacle: 'memory',
    })
  })

  /**
   * Each scope on its own, never what serves: a screen edits one side, and reading the effect
   * back into its controls left a click writing a scope that already agreed — doing nothing.
   */
  it('says what each scope holds, separately', () => {
    const choices: RoleChoices = { [DICTATION_ROLE]: { kind: 'local', modelId: 'parakeet' } }

    expect(rowOf(aiOverviewOf(input()), DICTATION_ROLE)?.chosen).toEqual({
      app: null,
      project: null,
    })
    expect(rowOf(aiOverviewOf(input({ choices })), DICTATION_ROLE)?.chosen).toEqual({
      app: { kind: 'local', modelId: 'parakeet' },
      project: null,
    })
    expect(
      rowOf(
        aiOverviewOf(input({ projectPath: '/here', projectChoices: { '/here': choices } })),
        DICTATION_ROLE,
      )?.chosen,
    ).toEqual({ app: null, project: { kind: 'local', modelId: 'parakeet' } })
  })

  /**
   * A choice the machine can no longer honour falls back rather than failing — the local side
   * wins by default, and a model deleted outside the studio must not leave a role pointing at
   * nothing.
   */
  it('falls back on what is there when the chosen model is gone', () => {
    const choices: RoleChoices = { [DICTATION_ROLE]: { kind: 'local', modelId: 'vanished' } }

    expect(rowOf(aiOverviewOf(input({ choices })), DICTATION_ROLE)?.provider).toEqual({
      kind: 'local',
      modelId: 'parakeet',
    })
  })

  // An account on file is not a choice: Scenario stays offered, never assumed.
  it('takes no cloud from an account when nothing was chosen', () => {
    const overview = aiOverviewOf(
      input({
        modelsFor: role => (role === ASSISTANT_ROLE ? [PARAKEET] : []),
        isInstalled: () => false,
        readyClouds: CLOUD_IDS,
      }),
    )

    expect(rowOf(overview, ASSISTANT_ROLE)?.provider).toBeNull()
    // Every cloud that DECLARES serving the role, which is not every cloud on file: one of them
    // only generates, and offering it here would open on an account that answers no conversation.
    expect(rowOf(overview, ASSISTANT_ROLE)?.clouds).toEqual(cloudsServing(ASSISTANT_ROLE))
  })
})

describe('what makes CUDA usable and not merely present', () => {
  const NVIDIA = { vendorId: 0x10de, deviceId: null, renderer: 'RTX 4090', machineModel: null }
  const TRELLIS = localModel({ id: 'trellis', needsCuda: true })
  const facing = (torchCuda: boolean | null) =>
    input({
      facts: { ...FACTS, gpu: NVIDIA },
      engineTorchCuda: torchCuda,
      modelsFor: role => (role === DICTATION_ROLE ? [TRELLIS] : []),
    })

  /**
   * The card alone announced TRELLIS compatible on a Windows machine whose PyPI torch is a CPU
   * build, and the load then answered `needs CUDA, this machine is cpu`.
   */
  it('stops calling a card compatible when the engine says its torch has no CUDA', () => {
    const row = rowOf(aiOverviewOf(facing(false)), DICTATION_ROLE)

    expect(row?.candidates[0]?.obstacle).toBe('cuda')
  })

  /** `null` is UNKNOWN, and the engine has not answered yet on the first composition. */
  it('trusts the card while the engine has said nothing', () => {
    const row = rowOf(aiOverviewOf(facing(null)), DICTATION_ROLE)

    expect(row?.candidates[0]?.obstacle).not.toBe('cuda')
  })

  it('refuses a machine with no NVIDIA card, whatever torch was built with', () => {
    expect(cudaUsableWith(FACTS.gpu, true)).toBe(false)
  })
})

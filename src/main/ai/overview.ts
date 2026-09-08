import {
  canServe,
  type AiOverview,
  type OwnModelProfile,
  type InstallRefusal,
  type LoadRefusal,
  type ModelCandidate,
  type RoleRow,
} from '@shared/domain/aiOverview'
import {
  allRoles,
  providerFor,
  roleChoicesFor,
  type AiRoleId,
  type RoleChoices,
} from '@shared/domain/aiRole'
import { cloudsServing } from '@shared/domain/aiCloud'
import type { MemorySnapshot } from '@shared/domain/aiMemory'
import {
  isSuppliedModel,
  provenanceUnverified,
  type DownloadProgress,
  type LocalModel,
} from '@shared/domain/localModel'
import { fitReadingOf, type CudaState } from '@shared/domain/modelFit'
import { isNvidia, type GpuIdentity, type HardwareFacts } from './hardwareProbe'

/**
 * Composing what the manager screen reads, from the pieces that already answer separately.
 *
 * Pure: the machine reading, the catalogue and the choices all arrive as arguments, so the shape
 * of the screen is testable without a disk, a network or an account.
 */
export type OverviewInput = {
  readonly facts: HardwareFacts
  readonly snapshot: MemorySnapshot
  readonly choices: RoleChoices
  readonly projectChoices: Readonly<Record<string, RoleChoices>>
  readonly projectPath: string | null
  /** What the catalogue offers for a role, in the order it offers them. */
  readonly modelsFor: (role: AiRoleId) => readonly LocalModel[]
  readonly isInstalled: (model: LocalModel) => boolean
  /** Whether the weights are resident in memory right now. */
  readonly isLoaded: (model: LocalModel) => boolean
  /** Whether the runtime that would host it can hold it in memory at all. */
  readonly isHoldable: (model: LocalModel) => boolean
  /** Whether the runtime that would host this model is answering — see `localRuntimes.ts`. */
  readonly runtimeReady: (model: LocalModel) => boolean
  /** How many employments one download answers for — see `rolesServedBy` in `catalogue.ts`. */
  readonly rolesServedBy: (modelId: string) => number
  /** The clouds an account is held for. What each of them SERVES is its own declaration. */
  readonly readyClouds: readonly string[]
  readonly installing: { readonly modelId: string; readonly progress: DownloadProgress } | null
  readonly loading: { readonly modelId: string; readonly ratio: number } | null
  readonly loadFailure: LoadRefusal | null
  readonly installFailure: InstallRefusal | null
  readonly ollamaReady: boolean
  readonly ollamaInstalled: boolean
  readonly ollamaNames: readonly string[]
  readonly ollamaProgress: number | null
  readonly ollamaFailed: boolean
  readonly engineProfile?: OwnModelProfile
  readonly engineKnown: boolean
  readonly engineMissing: readonly string[]
  /** Whether the engine's torch was built with CUDA, `null` until it has answered. */
  readonly engineTorchCuda: boolean | null
  readonly engineProgress: number | null
  readonly engineFailed: boolean
}

/**
 * What the card and the torch beside it allow together — `null` where there is no card at all.
 *
 * The card alone announced TRELLIS, InstantMesh and LGM as compatible on a Windows machine whose
 * PyPI torch is a CPU build, and the load then answered `needs CUDA, this machine is cpu`.
 * `torchCuda` is `null` until the engine has answered, and a `null` trusts the card. Only an
 * ANSWERED `false` reads `repairable`: installing the libraries again then fetches CUDA wheels.
 */
export function cudaStateOf(
  gpu: GpuIdentity | null,
  torchCuda: boolean | null,
): CudaState | undefined {
  // `undefined` and not `null`: this is what `MachineOffer.cuda` and `EngineOffer.cuda` are
  // OPTIONAL of, and two spellings of « no card » is the confusion this whole reading removes.
  if (!isNvidia(gpu)) return undefined
  return torchCuda === false ? 'repairable' : 'usable'
}

/**
 * The model a role would take on its own: the first candidate that is installed AND usable.
 *
 * Installed first, and not merely the best fit: offering a role a model nobody downloaded would
 * have it answer nothing until someone noticed.
 */
function localOptionsFor(candidates: readonly ModelCandidate[]): readonly string[] {
  return candidates.filter(canServe).map(one => one.model.id)
}

/**
 * One row, composed on its own — which is what lets `providerOf` answer for ONE role.
 *
 * `[M]` It used to compose the whole overview and throw twenty rows away, on every assistant turn:
 * twenty-one rows, their candidates and their verdicts, to read one field.
 */
export function rowFor(role: AiRoleId, input: OverviewInput, choices: RoleChoices): RoleRow {
  // Read once for the whole row: the card and the engine's answer are the same for every model.
  const cuda = cudaStateOf(input.facts.gpu, input.engineTorchCuda)
  const candidates: readonly ModelCandidate[] = input
    .modelsFor(role)
    .map(model => {
      const installed = input.isInstalled(model)
      const offer = {
        snapshot: input.snapshot,
        diskFreeBytes: input.facts.diskFreeBytes,
        installed,
        runtimeReady: input.runtimeReady(model),
        cuda,
      }

      return {
        model,
        installed,
        loaded: input.isLoaded(model),
        holdable: input.isHoldable(model),
        unverified: provenanceUnverified(model),
        supplied: isSuppliedModel(model),
        serves: input.rolesServedBy(model.id),
        ...fitReadingOf(model, offer),
      }
    })
    .filter(one => one.obstacle !== 'runtime')

  // A key HELD is not an endpoint behind it: a cloud is offered only where it DECLARES serving
  // the role, or the screen says an employment is served when nothing serves it.
  const clouds = cloudsServing(role).filter(id => input.readyClouds.includes(id))

  return {
    role,
    provider: providerFor(role, choices, {
      localModelIds: localOptionsFor(candidates),
      installedModelIds: candidates.filter(one => one.installed).map(one => one.model.id),
      cloudIds: clouds,
    }),
    chosen: chosenPerScope(role, input),
    candidates,
    clouds,
  }
}

/** What each scope holds for the role — never what serves it, which `provider` answers. */
function chosenPerScope(role: AiRoleId, input: OverviewInput): RoleRow['chosen'] {
  const forProject =
    input.projectPath === null ? undefined : input.projectChoices[input.projectPath]

  return { app: input.choices[role] ?? null, project: forProject?.[role] ?? null }
}

/** The choices that apply, so a caller composing ONE row overlays the same two scopes. */
export function effectiveChoices(input: OverviewInput): RoleChoices {
  return roleChoicesFor(input.choices, input.projectChoices, input.projectPath)
}

export function aiOverviewOf(input: OverviewInput): AiOverview {
  const choices = effectiveChoices(input)

  return {
    // Only the roles something could serve: twenty-one rows, most of them empty, would bury the
    // two that answer. A role with no candidate and no account has nothing to offer or explain.
    roles: allRoles()
      .map(role => rowFor(role, input, choices))
      .filter(row => row.candidates.length > 0 || row.clouds.length > 0),
    machine: {
      physicalBytes: input.facts.physicalBytes,
      availableBytes: input.snapshot.availableBytes,
      diskFreeBytes: input.facts.diskFreeBytes,
      gpu: input.facts.gpu?.renderer ?? null,
      vram:
        input.facts.vram === null
          ? null
          : {
              totalBytes: input.facts.vram.totalBytes,
              freeBytes: input.facts.vram.freeBytes,
            },
    },
    projectPath: input.projectPath,
    installing: input.installing,
    loading: input.loading,
    loadFailure: input.loadFailure,
    installFailure: input.installFailure,
    ollama: {
      ready: input.ollamaReady,
      installed: input.ollamaInstalled,
      names: input.ollamaNames,
      progress: input.ollamaProgress,
      failed: input.ollamaFailed,
    },
    engine: {
      known: input.engineKnown,
      ...(input.engineProfile ? { profile: input.engineProfile } : {}),
      missing: input.engineMissing,
      progress: input.engineProgress,
      failed: input.engineFailed,
      // Said HERE and not only on the models: the button that repairs it lives on this offer, and
      // a complete door hides it — which would leave the verdict on the models pointing at
      // nothing. See `AiEngineOffer`.
      cuda: cudaStateOf(input.facts.gpu, input.engineTorchCuda),
    },
  }
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CharacterKind } from '@shared/domain/character'
import { providersRefusalOf, rigProvidersOf } from '@shared/domain/rigProvider'
import { setCharacterAutoRig } from '@/engines/character/characterCommands'
import type { MeshSample } from '@/engines/scene/rigSnap'
import { useFamilyModels } from '@/hooks/useFamilyModels'
import { useMeshSizeLimit } from '@/hooks/useMeshSizeLimit'
import { usePlanAccess } from '@/hooks/usePlanAccess'
import { assetsById, useAssets } from '@/stores/assets'
import { characterOf, useCharacters } from '@/stores/character'
import { useAiModels } from '@/stores/aiModels'
import { AUTO_RIG_ROLE } from '@shared/domain/aiRole'
import { canServe, writeScopeFor, type RoleRow } from '@shared/domain/aiOverview'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { getBridge } from '@/services/bridge'
import { autoRigServiceFor } from '@/engines/character/autoRigBackends'
import { runTask } from '@/stores/tasks'
import {
  AUTO_RIG_PRODUCT_ERRORS,
  autoRigOptionsOf,
  type AutoRigInferenceOptions,
  type AutoRigProductError,
} from '@shared/domain/autoRigInference'

export function useCharacterFit(
  assetId: string,
  documentId: string,
  nodeId: string,
  sample: MeshSample | null,
) {
  const { t, i18n } = useTranslation()
  const [kind, setKind] = useState<CharacterKind>('auto')
  const plan = usePlanAccess()
  const services = rigProvidersOf(useFamilyModels('3d'))
  const maxSize = useMeshSizeLimit(services[0]?.modelId ?? null)
  const bytes = useAssets(state => assetsById(state).get(assetId)?.bytes ?? 0)
  const refusal = providersRefusalOf(services, plan, { bytes, maxSize })
  const overview = useAiModels(state => state.overview)
  const row = overview?.roles.find(one => one.role === AUTO_RIG_ROLE)
  const { candidate, needsDownload, rigBackends, selectedBackend } = rigOfferOf(row)
  const [failure, setFailure] = useState<AutoRigProductError | null>(null)
  const [running, setRunning] = useState(false)
  // Derived rather than initialised: the rig lands after this hook first runs, and a state seeded
  // once would have offered « simplified » over a rig whose fingers the first pass had asked for.
  const rigBones = useCharacters(state => characterOf(state, assetId)?.rig?.bones)
  const [chosenOptions, setMiaOptions] = useState<AutoRigInferenceOptions | null>(null)
  const miaOptions = chosenOptions ?? autoRigOptionsOf(rigBones)
  const chooseBackend = async (backendId: string): Promise<void> => {
    if (!row) return
    const picked = rigBackends.find(one => one.backendId === backendId)
    await useAiModels
      .getState()
      .chooseAiProvider(
        AUTO_RIG_ROLE,
        picked ? { kind: 'local', modelId: picked.modelId } : null,
        writeScopeFor(row, overview?.projectPath ?? null),
      )
  }
  const fit = async (requestedBackend = selectedBackend): Promise<void> => {
    setFailure(null)
    if (requestedBackend !== 'simple' && needsDownload) {
      setFailure('MODEL_NOT_INSTALLED')
      return
    }
    const engine = sceneEngineOf(documentId)
    if (!engine || !sample) {
      setFailure('ENGINE_UNAVAILABLE')
      return
    }
    setRunning(true)
    try {
      const output = await runTask(t('inspector.autoRigAdvanced'), async (id, watch) => {
        const signal = watch.signal ?? new AbortController().signal
        const targets = engine.autoRigTargets(nodeId)
        const identity = engine.autoRigIdentity(nodeId)
        const characterBefore = characterOf(useCharacters.getState(), assetId)
        if (targets.length === 0) throw new Error('INVALID_MESH')
        const service = autoRigServiceFor(
          async (_input, context) => {
            const result = await engine.simpleAutoRig(
              nodeId,
              sample,
              context.signal,
              context.onProgress,
            )
            if (!result) throw new Error(context.signal.aborted ? 'CANCELLED' : 'INVALID_MESH')
            return result
          },
          async (backendId, options, backendSignal) => {
            const bridge = getBridge()
            if (!bridge) throw new Error('ENGINE_UNAVAILABLE')
            const input = await engine.autoRigInput(nodeId, backendSignal)
            if (!input) throw new Error('INVALID_MESH')
            return await bridge.autoRig.run({ id, backendId, options, ...input })
          },
        )
        const result = await service.run(requestedBackend, miaOptions, {
          signal,
          onProgress: progress => watch.onStep?.(progress, 1),
          targets,
        })
        if (
          sceneEngineOf(documentId) !== engine ||
          engine.autoRigIdentity(nodeId) !== identity ||
          characterOf(useCharacters.getState(), assetId) !== characterBefore
        )
          throw new Error('CANCELLED')
        return result
      })
      if (!output) return
      useCharacters.getState().runCommand(assetId, setCharacterAutoRig(output))
    } catch (error) {
      setFailure(productErrorOf(error))
    } finally {
      setRunning(false)
    }
  }
  const download = async (): Promise<void> => {
    if (candidate) await useAiModels.getState().installAiModel(candidate.model.id)
  }
  const useSimple = async (): Promise<void> => {
    await chooseBackend('simple')
    await fit('simple')
  }
  return {
    t,
    i18n,
    kind,
    setKind,
    plan,
    services,
    maxSize,
    bytes,
    refusal,
    rigBackends,
    selectedBackend,
    chooseBackend,
    miaOptions,
    setMiaOptions,
    needsDownload,
    failure,
    running,
    download,
    useSimple,
    fit,
  }
}

/**
 * What the field may offer for the role, and which of them it names.
 *
 * Two escapes from `canServe`, answering different questions: what SERVES stays listed whatever
 * the machine now says of it — the assistant's list does the same — and what is CHOSEN stays
 * listed while it is missing from the disk, so the download button beside it names something.
 * The chosen one names the field first, so the refusal and that button agree with it.
 */
function rigOfferOf(row: RoleRow | undefined) {
  const configured = row?.chosen.project ?? row?.chosen.app
  const candidate =
    configured?.kind === 'local'
      ? row?.candidates.find(one => one.model.id === configured.modelId)
      : undefined
  const advanced = candidate?.model.backendId
  const needsDownload = advanced !== undefined && !candidate?.installed
  const serving = row?.provider?.kind === 'local' ? row.provider.modelId : null
  const rigBackends =
    row?.candidates.flatMap(one =>
      (canServe(one) || one.model.id === serving || one === candidate) && one.model.backendId
        ? [{ backendId: one.model.backendId, modelId: one.model.id, name: one.model.name }]
        : [],
    ) ?? []
  const servingBackend = row?.candidates.find(one => one.model.id === serving)?.model.backendId

  return {
    candidate,
    needsDownload,
    rigBackends,
    selectedBackend: (needsDownload ? advanced : undefined) ?? servingBackend ?? 'simple',
  }
}

function productErrorOf(error: unknown): AutoRigProductError {
  const message = String(error)
  return AUTO_RIG_PRODUCT_ERRORS.find(code => message.includes(code)) ?? 'INFERENCE_FAILED'
}

export type CharacterFit = ReturnType<typeof useCharacterFit>

import { CHARACTER_KINDS, HUMANOID_KINDS } from '@shared/domain/character'
import { formatBytes } from '@/helpers/format'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { rigFitFaultOf } from '@/engines/scene/rigFit'
import type { MeshSample } from '@/engines/scene/rigSnap'
import { rigServiceNote } from '@/helpers/rigServiceNote'
import { useCharacterFit, type CharacterFit } from '@/hooks/useCharacterFit'

export type CharacterInspectorFitProps = {
  assetId: string
  documentId: string
  nodeId: string
  /** What the engine measured of this mesh, or `null` while the file is still landing. */
  sample: MeshSample | null
  /** A successful regeneration replaces this rig only after the new result is complete. */
  hasRig?: boolean
}

const MIA_HELP = 'alert alert-info alert-soft min-h-0 px-2 py-1 text-tiny leading-tight'

function miaSettings(state: CharacterFit) {
  if (state.selectedBackend !== 'make-it-animatable') return null
  return (
    <details className="border-border border-y py-1" open>
      <summary className="text-muted text-tiny cursor-pointer py-1 font-medium">
        {state.t('inspector.autoRigMiaSettings')}
      </summary>
      <SelectField
        label={state.t('inspector.autoRigFingers')}
        value={state.miaOptions.fingers}
        options={[
          { value: 'detailed', label: state.t('inspector.autoRigFingerDetailed') },
          { value: 'simplified', label: state.t('inspector.autoRigFingerSimplified') },
        ]}
        onChange={fingers => state.setMiaOptions({ ...state.miaOptions, fingers })}
        scId="character.mia.fingers"
        actions={false}
      />
      <ToggleField
        label={state.t('inspector.autoRigUseSurfaceNormals')}
        value={state.miaOptions.useSurfaceNormals}
        onChange={useSurfaceNormals =>
          state.setMiaOptions({ ...state.miaOptions, useSurfaceNormals })
        }
        scId="character.mia.useSurfaceNormals"
        actions={false}
      />
      <p className={MIA_HELP}>{state.t('inspector.autoRigUseSurfaceNormalsHint')}</p>
      <ToggleField
        label={state.t('inspector.autoRigWeightPostProcessing')}
        value={state.miaOptions.weightPostProcessing}
        onChange={weightPostProcessing =>
          state.setMiaOptions({ ...state.miaOptions, weightPostProcessing })
        }
        scId="character.mia.weightPostProcessing"
        actions={false}
      />
      <p className={MIA_HELP}>{state.t('inspector.autoRigMiaSettingsHint')}</p>
    </details>
  )
}

function fitSelectors(state: CharacterFit) {
  const {
    t,
    kind,
    setKind,
    services,
    plan,
    bytes,
    maxSize,
    rigBackends,
    selectedBackend,
    chooseBackend,
  } = state
  const localModelIds = new Set(rigBackends.map(backend => backend.modelId))
  return (
    <>
      <SelectField
        label={t('inspector.characterKind')}
        value={kind}
        options={CHARACTER_KINDS.map(candidate => ({
          value: candidate,
          label: t(`inspector.characterKinds.${candidate}`),
        }))}
        onChange={setKind}
        scId="character.kind"
        actions={false}
      />
      <SelectField
        label={t('inspector.rigService')}
        value={selectedBackend}
        options={[
          { value: 'simple', label: t('inspector.rigServiceLocal') },
          ...rigBackends.map(backend => ({ value: backend.backendId, label: backend.name })),
          ...services
            .filter(service => !localModelIds.has(service.modelId))
            .map(service => ({
              value: `service:${service.modelId}`,
              label: `${service.name} — ${rigServiceNote(service, plan, { bytes, maxSize }, t)}`,
              disabled: true,
            })),
        ]}
        onChange={backendId => void chooseBackend(backendId)}
        scId="character.service"
        actions={false}
      />
    </>
  )
}

function fitNotices(state: CharacterFit) {
  const { t, i18n, refusal, kind, plan } = state
  return (
    <>
      {refusal?.kind === 'plan' && (
        <QuietNote>{t('inspector.rigServicesLocked', { plan: plan?.name ?? '' })}</QuietNote>
      )}
      {refusal?.kind === 'too-large' && (
        <QuietNote>
          {t('inspector.rigServicesTooLarge', {
            limit: formatBytes(refusal.maxSize, unit => t(`units.${unit}`), i18n.language),
          })}
        </QuietNote>
      )}
      {!HUMANOID_KINDS.includes(kind) && <QuietNote>{t('inspector.rigNotHumanoid')}</QuietNote>}
    </>
  )
}

function fitActions(state: CharacterFit, hasRig: boolean) {
  return (
    <>
      {state.failure && (
        <QuietNote>{state.t(`inspector.autoRigErrors.${state.failure}`)}</QuietNote>
      )}
      {state.needsDownload && (
        <Button onClick={() => void state.download()}>
          {state.t('inspector.autoRigDownload')}
        </Button>
      )}
      {state.failure && state.failure !== 'CANCELLED' && (
        <Button onClick={() => void state.useSimple()}>
          {state.t('inspector.autoRigUseSimple')}
        </Button>
      )}
      <Button
        disabled={!HUMANOID_KINDS.includes(state.kind) || state.running}
        // Asked for once, plainly: what a regeneration drops of the rig in place, no Cancel covers
        // — only the undo stack does, and nothing on screen says so.
        onClick={() => {
          if (!hasRig || window.confirm(state.t('inspector.rigRegenerateConfirm'))) void state.fit()
        }}
      >
        {state.t(hasRig ? 'inspector.rigRegenerate' : 'inspector.rigCreate')}
      </Button>
    </>
  )
}

/**
 * Making a bare mesh animatable: the studio's own rigger, or a service that does it for credits.
 *
 * 🛑 The chain a service needs — the file, its id, a job to follow — is only verifiable here: the
 * inspector could offer none of it, which is why every service was shown greyed out over there.
 */
export function CharacterInspectorFit({
  assetId,
  documentId,
  nodeId,
  sample,
  hasRig = false,
}: CharacterInspectorFitProps) {
  const state = useCharacterFit(assetId, documentId, nodeId, sample)
  const fault = sample ? rigFitFaultOf(sample.bounds) : null
  if (fault) return <QuietNote>{state.t(`inspector.rigFault_${fault}`)}</QuietNote>
  if (!sample) return null

  return (
    <>
      {fitSelectors(state)}
      {miaSettings(state)}
      {fitNotices(state)}
      {fitActions(state, hasRig)}
    </>
  )
}

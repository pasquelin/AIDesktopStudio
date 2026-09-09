// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { AnimationParameter, AnimationState } from '@shared/domain/animationGraph'
import { CLIP_SOURCES, CLIP_SPEED } from '@shared/domain/sceneModel'
import type { ClipSource, RootMotion } from '@shared/domain/sceneModel'
import { ROOT_MOTIONS } from '@shared/domain/sceneModel'
import { NumberField } from '@/components/NumberField'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'
import { ToggleField } from '@/components/ToggleField'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'

export type AnimationGraphStateFormProps = {
  /**
   * The declarations a speed may be read from — only a NUMBER can multiply one, and the reader
   * refuses anything else, so the picker offers exactly what would be accepted. Sifted by the
   * form above, which holds the same list for every state it draws.
   */
  numbers: readonly AnimationParameter[]
  state: AnimationState
  /** `null` removes it — the shape `InputMapExpertBinding` uses, for the same reason. */
  onChange: (state: AnimationState | null) => void
}

/** A clip source keeps its own fields; only the NAME is shared by all three. */
function sourceWithKind(source: ClipSource, kind: ClipSource['kind']): ClipSource {
  if (kind === 'asset') return { kind, assetId: '', name: source.name }
  return { kind, name: source.name }
}

/** One state of the layer: the clip it plays, and how it is played. */
export function AnimationGraphStateForm({
  numbers,
  state,
  onChange,
}: AnimationGraphStateFormProps) {
  const { t } = useTranslation()

  return (
    <PropertySection
      title={state.id}
      description={t('game.animationGraph.stateDescription')}
      scId={`animationGraph.state.${state.id}`}
      plate
      actions={
        <ToolButton
          icon={mdiTrashCanOutline}
          label={t('game.animationGraph.removeState')}
          tooltip={TIP_LEFT}
          variant="header"
          onClick={() => onChange(null)}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <TextField
          scId={`animationGraph.state.${state.id}.id`}
          label={t('inspector.name')}
          value={state.id}
          onChange={id => onChange({ ...state, id })}
        />
        <SelectField
          scId={`animationGraph.state.${state.id}.clipKind`}
          label={t('inspector.source')}
          hint={TIP_LEFT(t('inspector.source'), false, t('game.animationGraph.clipKindHelp'))}
          value={state.source.kind}
          options={CLIP_SOURCES.map(kind => ({
            value: kind,
            label: t(`game.animationGraph.clipKinds.${kind}`),
          }))}
          onChange={kind => onChange({ ...state, source: sourceWithKind(state.source, kind) })}
        />
        <TextField
          scId={`animationGraph.state.${state.id}.clipName`}
          label={t('inspector.clip')}
          value={state.source.name}
          onChange={name => onChange({ ...state, source: { ...state.source, name } })}
        />
        <ToggleField
          scId={`animationGraph.state.${state.id}.loop`}
          label={t('inspector.clipLoop')}
          value={state.loop}
          onChange={loop => onChange({ ...state, loop })}
        />
        <NumberField
          scId={`animationGraph.state.${state.id}.speed`}
          label={t('inspector.speed')}
          value={state.speed}
          min={CLIP_SPEED.min}
          max={CLIP_SPEED.max}
          onChange={speed => onChange({ ...state, speed })}
        />
        <SelectField
          scId={`animationGraph.state.${state.id}.speedFrom`}
          label={t('game.animationGraph.speedFrom')}
          hint={TIP_LEFT(
            t('game.animationGraph.speedFrom'),
            false,
            t('game.animationGraph.speedFromHelp'),
          )}
          value={state.speedFrom ?? ''}
          options={[
            { value: '', label: t('game.animationGraph.speedFromNone') },
            ...numbers.map(parameter => ({ value: parameter.id, label: parameter.id })),
          ]}
          onChange={speedFrom =>
            onChange(
              speedFrom === '' ? { ...state, speedFrom: undefined } : { ...state, speedFrom },
            )
          }
        />
        <SelectField
          scId={`animationGraph.state.${state.id}.rootMotion`}
          label={t('inspector.clipRootMotion')}
          value={state.rootMotion}
          options={ROOT_MOTIONS.map((motion: RootMotion) => ({
            value: motion,
            label: t(`inspector.rootMotion_${motion}`),
          }))}
          onChange={rootMotion => onChange({ ...state, rootMotion })}
        />
      </div>
    </PropertySection>
  )
}

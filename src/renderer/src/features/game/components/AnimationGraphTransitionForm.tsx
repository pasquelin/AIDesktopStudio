// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import {
  BUILT_IN_PARAMETERS,
  type AnimationCondition,
  type AnimationGraph,
  type AnimationLayer,
  type AnimationParameterKind,
  type AnimationTransition,
} from '@shared/domain/animationGraph'
import { MAX_CLIP_FADE } from '@shared/domain/sceneModel'
import { Button } from '@/components/Button'
import { NumberField } from '@/components/NumberField'
import { SelectField } from '@/components/SelectField'
import { FieldActions } from '@/components/FieldActions'
import { ToolButton } from '@/components/ToolButton'
import { PANEL_GROUP_LABEL, PANEL_GROUP_LABEL_WIDE } from '@/components/styles'
import { FIELD_BLOCK } from '@/components/panelStyles'
import { TIP_LEFT } from '@/helpers/tooltip'
import { AnimationGraphConditionRow } from './AnimationGraphConditionRow'

export type AnimationGraphTransitionFormProps = {
  graph: AnimationGraph
  layer: AnimationLayer
  transition: AnimationTransition
  rank: number
  onChange: (transition: AnimationTransition | null) => void
}

const ANY_STATE = ''

/**
 * One way out of a state, as a band of the section — full-bleed, so its labels stand on the same
 * column as the fields above it rather than eight pixels further in.
 */
export function AnimationGraphTransitionForm({
  graph,
  layer,
  transition,
  rank,
  onChange,
}: AnimationGraphTransitionFormProps) {
  const { t } = useTranslation()
  // Both halves of what a condition may stand on: the runtime's own, and the author's — the
  // reader refuses any other name, so the picker offers no name it would refuse.
  const parameters = new Map<string, AnimationParameterKind>([
    ...Object.entries(BUILT_IN_PARAMETERS),
    ...graph.parameters.map((one): [string, AnimationParameterKind] => [one.id, one.kind]),
  ])
  const scId = `animationGraph.transition.${rank}`

  const changedCondition = (at: number, condition: AnimationCondition | null): void => {
    const when = condition
      ? transition.when.map((one, index) => (index === at ? condition : one))
      : transition.when.filter((_, index) => index !== at)
    onChange({ ...transition, when })
  }

  return (
    <div className={FIELD_BLOCK}>
      <div className="flex items-center gap-2">
        <span className={PANEL_GROUP_LABEL_WIDE}>
          {t('game.animationGraph.transitionRank', { rank })}
        </span>
        <FieldActions>
          <ToolButton
            icon={mdiTrashCanOutline}
            label={t('game.animationGraph.removeTransition')}
            tooltip={TIP_LEFT}
            variant="header"
            onClick={() => onChange(null)}
          />
        </FieldActions>
      </div>

      <div className="flex flex-col gap-2">
        <SelectField
          scId={`${scId}.from`}
          label={t('game.animationGraph.from')}
          hint={TIP_LEFT(t('game.animationGraph.from'), false, t('game.animationGraph.fromHelp'))}
          value={transition.from}
          options={[
            { value: ANY_STATE, label: t('game.animationGraph.anyState') },
            ...layer.states.map(state => ({ value: state.id, label: state.id })),
          ]}
          onChange={from => onChange({ ...transition, from })}
        />
        <SelectField
          scId={`${scId}.to`}
          label={t('game.animationGraph.to')}
          value={transition.to}
          options={layer.states.map(state => ({ value: state.id, label: state.id }))}
          onChange={to => onChange({ ...transition, to })}
        />
        <NumberField
          scId={`${scId}.fade`}
          label={t('inspector.clipFade')}
          hint={TIP_LEFT(t('inspector.clipFade'), false, t('game.animationGraph.fadeHelp'))}
          value={transition.fade}
          min={0}
          max={MAX_CLIP_FADE}
          onChange={fade => onChange({ ...transition, fade })}
        />
        <NumberField
          scId={`${scId}.exitTime`}
          label={t('game.animationGraph.exitTime')}
          hint={TIP_LEFT(
            t('game.animationGraph.exitTime'),
            false,
            t('game.animationGraph.exitTimeHelp'),
          )}
          value={transition.exitTime ?? 0}
          min={0}
          max={1}
          onChange={exitTime => onChange({ ...transition, exitTime })}
        />
        <NumberField
          scId={`${scId}.priority`}
          label={t('game.animationGraph.priority')}
          hint={TIP_LEFT(
            t('game.animationGraph.priority'),
            false,
            t('game.animationGraph.priorityHelp'),
          )}
          value={transition.priority}
          step={1}
          onChange={priority => onChange({ ...transition, priority })}
        />
      </div>

      <span className={PANEL_GROUP_LABEL}>{t('inspector.conditions')}</span>
      {transition.when.map((condition, at) => (
        <AnimationGraphConditionRow
          key={`${condition.param}:${at}`}
          condition={condition}
          rank={at + 1}
          parameters={parameters}
          scId={`${scId}.when.${at}`}
          onChange={next => changedCondition(at, next)}
        />
      ))}
      <div className="flex">
        <Button
          onClick={() =>
            onChange({
              ...transition,
              when: [...transition.when, { param: 'speed', op: '>', value: 0 }],
            })
          }
        >
          {t('inspector.addCondition')}
        </Button>
      </div>
    </div>
  )
}

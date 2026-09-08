// SPDX-License-Identifier: MIT
import { mdiTrashCanOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import {
  CONDITION_OPERATORS,
  type AnimationCondition,
  type AnimationParameterKind,
} from '@shared/domain/animationGraph'
import { FieldGrid } from '@/components/FieldGrid'
import { NumberField } from '@/components/NumberField'
import { SelectField } from '@/components/SelectField'
import { ToggleField } from '@/components/ToggleField'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'

export type AnimationGraphConditionRowProps = {
  condition: AnimationCondition
  /** Every name a condition may stand on — the runtime's own, then the author's — and what it holds. */
  parameters: ReadonlyMap<string, AnimationParameterKind>
  scId: string
  onChange: (condition: AnimationCondition | null) => void
}

/**
 * 🛑 An ordering on a switch answers whatever `false < true` happens to mean, so the reader
 * refuses it: a boolean parameter compares by `==` or `!=` and by nothing else. The picker offers
 * what would be accepted rather than letting the save explain it afterwards — and the VALUE
 * follows the same rule, a tick for a switch and a figure for a number.
 */
const SWITCH_OPERATORS: readonly AnimationCondition['op'][] = ['==', '!=']

export function AnimationGraphConditionRow({
  condition,
  parameters,
  scId,
  onChange,
}: AnimationGraphConditionRowProps) {
  const { t } = useTranslation()
  const kind = parameters.get(condition.param) ?? 'number'
  const operators = kind === 'boolean' ? SWITCH_OPERATORS : CONDITION_OPERATORS

  // The value carries the kind of what it compares: swapping the parameter for one of the other
  // kind would otherwise leave a number under a switch, which the reader refuses on saving.
  const changedParam = (param: string): void => {
    const next = parameters.get(param) ?? 'number'
    if (next === kind) return onChange({ ...condition, param })
    onChange({
      param,
      op: next === 'boolean' ? '==' : condition.op,
      value: next === 'boolean' ? true : 0,
    })
  }

  return (
    <FieldGrid>
      <SelectField
        scId={`${scId}.param`}
        label={t('inspector.conditionField')}
        value={condition.param}
        options={[...parameters.keys()].map(id => ({ value: id, label: id }))}
        onChange={changedParam}
      />
      <SelectField
        scId={`${scId}.op`}
        label={t('inspector.conditionOperator')}
        value={condition.op}
        options={operators.map(op => ({ value: op, label: op }))}
        onChange={op => onChange({ ...condition, op })}
      />
      {kind === 'boolean' ? (
        <ToggleField
          scId={`${scId}.value`}
          label={t('inspector.conditionValue')}
          value={condition.value === true}
          onChange={value => onChange({ ...condition, value })}
        />
      ) : (
        <NumberField
          scId={`${scId}.value`}
          label={t('inspector.conditionValue')}
          value={typeof condition.value === 'number' ? condition.value : 0}
          onChange={value => onChange({ ...condition, value })}
        />
      )}
      <div className="flex items-center justify-end">
        <ToolButton
          icon={mdiTrashCanOutline}
          label={t('inspector.removeCondition')}
          tooltip={TIP_LEFT}
          variant="row"
          onClick={() => onChange(null)}
        />
      </div>
    </FieldGrid>
  )
}

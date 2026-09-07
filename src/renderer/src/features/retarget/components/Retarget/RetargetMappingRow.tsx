import { mdiLock, mdiLockOpenVariant } from '@mdi/js'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { HumanoidRole } from '@shared/domain/humanoid'
import { SelectField } from '@/components/SelectField'
import { PropertyRow } from '@/components/PropertyRow'
import { ToolButton } from '@/components/ToolButton'
import { HINT_LEFT } from '@/helpers/tooltip'
import { boneFor, type RetargetMappingSide } from '../../retargetMappingSide'

export type BoneChoice = { value: string; label: string }

/**
 * 🛑 Memoised, and its options RECEIVED: a humanoid has fifty-two roles and a rig some seventy
 * bones, so redrawing this section rebuilt around 7 400 `<option>` — on every letter typed into a
 * field three components away, the workspace passing its props whole.
 */
export const RetargetMappingRow = memo(function RetargetMappingRow({
  role,
  source,
  target,
  sourceBones,
  targetBones,
  locked,
  onLock,
  onChoose,
}: {
  role: HumanoidRole
  source: RetargetMappingSide
  target: RetargetMappingSide
  sourceBones: readonly BoneChoice[]
  targetBones: readonly BoneChoice[]
  locked: boolean
  onLock: (role: HumanoidRole) => void
  onChoose: (side: RetargetMappingSide, role: HumanoidRole, name: string) => void
}) {
  const { t } = useTranslation()
  return (
    <PropertyRow shape="stacked" label={t(`character.retarget.roles.${role}`)}>
      <div className="flex min-w-0 items-center gap-(--sc-gutter)">
        {(
          [
            ['source', source, sourceBones],
            ['target', target, targetBones],
          ] satisfies [string, RetargetMappingSide, readonly BoneChoice[]][]
        ).map(([id, side, bones]) => (
          <SelectField
            key={id}
            className="min-w-0 flex-1"
            layout="inline"
            label={t('character.retarget.mappingField', {
              side: t(`character.retarget.${id}`),
              role: t(`character.retarget.roles.${role}`),
            })}
            scId={`retarget.${id}.${role}`}
            value={boneFor(side.profile, role)}
            options={bones}
            onChange={name => onChoose(side, role, name)}
          />
        ))}
        <ToolButton
          icon={locked ? mdiLock : mdiLockOpenVariant}
          variant="row"
          active={locked}
          label={t('character.retarget.lockRole', {
            lock: t('character.retarget.lock'),
            role: t(`character.retarget.roles.${role}`),
          })}
          tooltip={HINT_LEFT}
          onClick={() => onLock(role)}
          data-sc={`field:retarget.lock.${role}`}
        />
      </div>
    </PropertyRow>
  )
})

import { mdiLock, mdiLockOpenVariant } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { HumanoidRole } from '@shared/domain/humanoid'
import { SelectField } from '@/components/SelectField'
import { PropertyRow } from '@/components/PropertyRow'
import { ToolButton } from '@/components/ToolButton'
import { HINT_LEFT } from '@/helpers/tooltip'
import { boneFor, type RetargetMappingSide } from '../../retargetMappingSide'

export function RetargetMappingRow({
  role,
  source,
  target,
  locked,
  onLock,
  onChoose,
}: {
  role: HumanoidRole
  source: RetargetMappingSide
  target: RetargetMappingSide
  locked: boolean
  onLock: () => void
  onChoose: (side: RetargetMappingSide, role: HumanoidRole, name: string) => void
}) {
  const { t } = useTranslation()
  return (
    <PropertyRow shape="stacked" label={t(`character.retarget.roles.${role}`)}>
      <div className="flex min-w-0 items-center gap-(--sc-gutter)">
        {(
          [
            ['source', source],
            ['target', target],
          ] satisfies [string, RetargetMappingSide][]
        ).map(([id, side]) => (
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
            options={[
              { value: '', label: t('character.retarget.unmapped') },
              ...side.view.bones.map(bone => ({ value: bone.name, label: bone.name })),
            ]}
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
          onClick={onLock}
          data-sc={`field:retarget.lock.${role}`}
        />
      </div>
    </PropertyRow>
  )
}

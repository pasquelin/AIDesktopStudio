import { mdiFilterVariant } from '@mdi/js'
import { ToolButton } from '@/components/ToolButton'
import { QuietNote } from '@/components/QuietNote'
import { HINT_LEFT } from '@/helpers/tooltip'
import { RetargetMappingRow } from './RetargetMappingRow'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  HUMANOID_BODY_ROLES,
  HUMANOID_FINGER_ROLES,
  type HumanoidRole,
} from '@shared/domain/humanoid'
import { profileWithRole, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import { PropertySection } from '@/components/PropertySection'
import { SearchField } from '@/components/SearchField'
import { Button } from '@/components/Button'
import { motionProfile } from '../../retargetDraft'
import type { RetargetMappingSide } from '../../retargetMappingSide'

type Props = { source: RetargetMappingSide; target: RetargetMappingSide; resetKey?: string }
const boneFor = (profile: SkeletonProfile, role: HumanoidRole) =>
  Object.keys(profile.roles).find(name => profile.roles[name] === role) ?? ''

export function RetargetMapping({ source, target, resetKey }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [missing, setMissing] = useState(false)
  const [locked, setLocked] = useState<ReadonlySet<HumanoidRole>>(new Set())
  useEffect(() => {
    setLocked(new Set())
  }, [resetKey])
  const visible = (role: HumanoidRole) => {
    const from = boneFor(source.profile, role)
    const to = boneFor(target.profile, role)
    return (
      (!missing || !from || !to) &&
      `${t(`character.retarget.roles.${role}`)} ${from} ${to}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  }
  const auto = () => {
    for (const side of [source, target]) {
      let next = side.profile
      for (const [bone, role] of Object.entries(motionProfile(side.view.bones).roles)) {
        if (locked.has(role) || boneFor(next, role) || next.roles[bone]) continue
        next = profileWithRole(next, bone, role)
      }
      side.onChange(next)
    }
  }
  const choose = (side: RetargetMappingSide, role: HumanoidRole, name: string) => {
    let next = side.profile
    const previous = boneFor(next, role)
    if (previous) next = profileWithRole(next, previous, null)
    if (name) next = profileWithRole(next, name, role)
    side.onChange(next)
    setLocked(current => new Set([...current, role]))
    for (const one of [source, target]) {
      const bone = one === side ? name : boneFor(one.profile, role)
      one.view.engine.setPickedBone(bone ? { nodeId: one.view.nodeId, bone } : null)
    }
  }
  const groups = [
    {
      id: 'torso',
      roles: HUMANOID_BODY_ROLES.filter(
        role => !role.startsWith('Left') && !role.startsWith('Right'),
      ),
    },
    { id: 'arms', roles: HUMANOID_BODY_ROLES.filter(role => /Shoulder|Arm|Hand/.test(role)) },
    { id: 'legs', roles: HUMANOID_BODY_ROLES.filter(role => /Leg|Foot|Toes/.test(role)) },
    { id: 'fingers', roles: HUMANOID_FINGER_ROLES },
  ]
  return (
    <PropertySection title={t('character.retarget.mapping')} scId="retarget.mapping">
      <SearchField
        scId="retarget.search"
        label={t('character.retarget.search')}
        value={query}
        onChange={setQuery}
      />
      <div className="flex items-center justify-between gap-2">
        <Button onClick={auto}>{t('character.retarget.auto')}</Button>
        <ToolButton
          icon={mdiFilterVariant}
          active={missing}
          label={t('character.retarget.onlyMissing')}
          tooltip={HINT_LEFT}
          onClick={() => setMissing(value => !value)}
        />
      </div>
      {groups.map(group => {
        const roles = group.roles.filter(visible)
        if (roles.length === 0) return null
        return (
          <PropertySection
            key={`${group.id}:${Boolean(query || missing)}`}
            scId={`retarget.${group.id}`}
            title={t('character.retarget.groupCount', {
              name: t(`character.retarget.groups.${group.id}`),
              count: roles.length,
            })}
            defaultOpen={group.id === 'torso' || Boolean(query || missing)}
          >
            <QuietNote>
              {t('character.retarget.mappingDirection', {
                from: t('character.retarget.source'),
                to: t('character.retarget.target'),
              })}
            </QuietNote>
            {roles.map(role => (
              <RetargetMappingRow
                key={role}
                role={role}
                source={source}
                target={target}
                locked={locked.has(role)}
                onChoose={choose}
                onLock={() =>
                  setLocked(current => {
                    const next = new Set(current)
                    if (next.has(role)) next.delete(role)
                    else next.add(role)
                    return next
                  })
                }
              />
            ))}
          </PropertySection>
        )
      })}
    </PropertySection>
  )
}

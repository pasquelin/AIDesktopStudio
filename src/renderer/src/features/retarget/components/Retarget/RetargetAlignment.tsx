import { useState } from 'react'
import { Euler, Quaternion } from 'three'
import { useTranslation } from 'react-i18next'
import { degreesOf, toRadians } from '@shared/domain/angles'
import type { Vector3 } from '@shared/domain/transform'
import { snap } from '@shared/numeric'
import { changedFields } from '@/helpers/objects'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import { VectorField } from '@/components/VectorField'
import { QuietNote } from '@/components/QuietNote'
import type { WireBone } from '@/engines/scene/retargetMessage'

type Props = {
  bones: readonly WireBone[]
  profile: SkeletonProfile
  onChange: (profile: SkeletonProfile) => void
  side: 'source' | 'target'
}
export function RetargetAlignment({ bones, profile, onChange, side }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState('')
  const bone = bones.find(one => one.name === selected) ?? bones[0]
  if (!bone) return null
  const turn = new Euler().setFromQuaternion(new Quaternion(...bone.quaternion))
  const original = {
    position: { x: bone.position[0], y: bone.position[1], z: bone.position[2] },
    rotation: { x: turn.x, y: turn.y, z: turn.z },
    scale: { x: bone.scale[0], y: bone.scale[1], z: bone.scale[2] },
  }
  const rest = profile.restPose?.[bone.name] ?? original
  const shown = roundedDegrees(rest.rotation)
  return (
    <PropertySection
      title={t(`character.retarget.${side === 'source' ? 'sourceAlignment' : 'targetAlignment'}`)}
      scId={`retarget.${side}.alignment`}
      defaultOpen={false}
    >
      <QuietNote>{t('character.retarget.alignmentHint')}</QuietNote>
      <SelectField
        scId={`retarget.${side}.alignmentBone`}
        label={t('character.retarget.bone')}
        value={bone.name}
        options={bones.map(one => ({ value: one.name, label: one.name }))}
        onChange={setSelected}
      />
      <VectorField
        scId={`retarget.${side}.alignmentTurn`}
        label={t('character.retarget.rotation')}
        value={shown}
        defaults={roundedDegrees(original.rotation)}
        step={1}
        onChange={next =>
          onChange({
            ...profile,
            restPose: {
              ...profile.restPose,
              [bone.name]: { ...rest, rotation: turned(rest.rotation, shown, next) },
            },
          })
        }
      />
    </PropertySection>
  )
}

function roundedDegrees(rotation: Vector3): Vector3 {
  const degrees = degreesOf(rotation)
  return { x: snap(degrees.x, 0.01), y: snap(degrees.y, 0.01), z: snap(degrees.z, 0.01) }
}

// Only the axes the field changed are converted back: the others keep their exact radians.
function turned(rotation: Vector3, shown: Vector3, next: Vector3): Vector3 {
  const edited = changedFields(shown, next)
  return {
    x: edited.x === undefined ? rotation.x : toRadians(edited.x),
    y: edited.y === undefined ? rotation.y : toRadians(edited.y),
    z: edited.z === undefined ? rotation.z : toRadians(edited.z),
  }
}

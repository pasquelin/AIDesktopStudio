import { useTranslation } from 'react-i18next'
import { aiRoleId } from '@shared/domain/aiRole'
import { Generator } from '@/features/generation/components/Generator/Generator'
import { CharacterMotionPickerImport } from '@/features/character/components/Character/Motion/CharacterMotionPickerImport'
import { CharacterMotionPickerLibrary } from '@/features/character/components/Character/Motion/CharacterMotionPickerLibrary'
import { PropertySection } from '@/components/PropertySection'
import { SelectField } from '@/components/SelectField'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'
import type { WireClip } from '@/engines/scene/retargetMessage'

export function RetargetSource({
  source,
  sourceLoading,
  chosen,
  choose,
  clipIndex,
  setClipIndex,
}: RetargetWorkspaceState) {
  const { t } = useTranslation()
  return (
    <>
      <PropertySection title={t('character.retarget.source')} scId="retarget.source">
        <CharacterMotionPickerImport onChoose={choose} />
        <CharacterMotionPickerLibrary
          selected={chosen}
          documentId="retarget"
          nodeId="retarget-source"
          onChoose={choose}
        />
        {source && (
          <div inert={sourceLoading}>
            <SelectField
              scId="retarget.clip"
              label={t('character.retarget.clip')}
              value={String(clipIndex)}
              options={source.clips.map((_, index) => ({
                value: String(index),
                label: clipOptionOf(source.clips, index, t),
              }))}
              onChange={value => setClipIndex(Number(value))}
            />
          </div>
        )}
      </PropertySection>
      <PropertySection
        title={t('character.retarget.generate')}
        scId="retarget.generate"
        defaultOpen={false}
      >
        <Generator
          fixedRole={aiRoleId('3d', 'motion')}
          onCompleted={job => {
            const id = job.assetIds[0]
            if (id) choose({ kind: 'asset', assetId: id, name: job.label }, job.label)
          }}
        />
      </PropertySection>
    </>
  )
}

function clipOptionOf(
  clips: readonly WireClip[],
  index: number,
  label: (key: string, values: { name: string; n: number }) => string,
): string {
  const clip = clips[index]
  if (!clip?.name) return String(index + 1)
  const clashes = clips.filter(other => other.name === clip.name).length > 1
  return clashes
    ? label('character.retarget.clipHomonym', { name: clip.name, n: index + 1 })
    : clip.name
}

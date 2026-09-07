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
              options={clipOptionsOf(source.clips, t)}
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

/** Counted once rather than per index: a Mixamo pack lands 300 clips in one file. */
function clipOptionsOf(
  clips: readonly WireClip[],
  label: (key: string, values: { name: string; n: number }) => string,
): { value: string; label: string }[] {
  const seen = new Map<string, number>()
  for (const clip of clips) if (clip.name) seen.set(clip.name, (seen.get(clip.name) ?? 0) + 1)
  return clips.map((clip, index) => ({
    value: String(index),
    label: !clip.name
      ? String(index + 1)
      : (seen.get(clip.name) ?? 0) > 1
        ? label('character.retarget.clipHomonym', { name: clip.name, n: index + 1 })
        : clip.name,
  }))
}

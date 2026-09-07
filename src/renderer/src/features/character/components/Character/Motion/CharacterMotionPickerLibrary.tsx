import { mdiFileOutline, mdiPackageVariantClosed } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import type { ClipSource } from '@shared/domain/scene'
import { clipKeyOf } from '@shared/domain/sceneModel'
import { Collection } from '@/components/Collection/Collection'
import { EmptyState } from '@/components/EmptyState'
import { Row } from '@/components/Row'
import { clipLabel } from '@/helpers/clipLabel'
import { useBundledAnimations } from '@/hooks/useBundledAnimations'
import { useProjectAnimations } from '@/hooks/useProjectAnimations'
import { clipsOfNode, useModelFiles } from '@/stores/modelFiles'
import { assetIcon } from '@/helpers/workspaces'

export type CharacterMotionPickerLibraryProps = {
  selected?: ClipSource | null
  documentId: string
  nodeId: string
  onChoose: (source: ClipSource, label: string) => void
}

/**
 * Everything already at hand: the character's own clips, the animations the app ships with, and
 * whatever the project files as motion.
 *
 * One list rather than three, because from where someone stands all three answer the same
 * question — and only the choice decides what a block ends up reading.
 */
export function CharacterMotionPickerLibrary({
  selected,
  documentId,
  nodeId,
  onChoose,
}: CharacterMotionPickerLibraryProps) {
  const { t } = useTranslation()
  const bundled = useBundledAnimations()
  const own = useModelFiles(state => clipsOfNode(state, documentId, nodeId))
  const motions = useProjectAnimations()

  /**
   * One entry per motion, whichever of the three it comes from — the row is the shared one.
   *
   * `label` is what goes into the document and `shown` is what the row reads: they part company
   * for a clip the exporter named, where a translated word must not be written into a glTF.
   */
  type Motion = { id: string; label: string; source: ClipSource; icon: string; shown: string }

  const offered: Motion[] = [
    ...own.map(clip => ({
      id: `own:${clip}`,
      label: clip,
      source: { kind: 'embedded', name: clip } satisfies ClipSource,
      icon: mdiFileOutline,
      shown: clipLabel(clip, t),
    })),
    ...bundled.map(animation => ({
      id: `bundled:${animation.name}`,
      label: animation.name,
      source: { kind: 'bundled', name: animation.name } satisfies ClipSource,
      icon: mdiPackageVariantClosed,
      shown: animation.name,
    })),
    ...motions.map(asset => ({
      id: `asset:${asset.id}`,
      label: asset.name,
      source: { kind: 'asset', assetId: asset.id, name: asset.name } satisfies ClipSource,
      icon: assetIcon('animation'),
      shown: asset.name,
    })),
  ]

  return (
    <Collection
      label={t('inspector.animationLibrary')}
      items={offered}
      // By `clipKeyOf`, the identity of a `ClipSource` the repo already writes: matched by hand
      // it ignored `clipIndex`, so two clips of one asset lit up together.
      selectedIds={offered
        .filter(motion => selected && clipKeyOf(motion.source) === clipKeyOf(selected))
        .map(motion => motion.id)}
      onSelect={motion => onChoose(motion.source, motion.label)}
      renderRow={motion => <Row icon={motion.icon} title={motion.shown} />}
      empty={
        <EmptyState icon={mdiPackageVariantClosed} message={t('inspector.animationLibraryEmpty')} />
      }
    />
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { ANIMATION_EXTENSIONS } from '@shared/domain/animationLibrary'
import { needsMeshConversion } from '@shared/domain/meshImport'
import type { ClipSource } from '@shared/domain/scene'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { getBridge } from '@/services/bridge'
import { reportImportNotices } from '@/services/externalFiles'
import { useAssets } from '@/stores/assets'
import { runTask } from '@/stores/tasks'

export type CharacterMotionPickerImportProps = {
  onChoose: (source: ClipSource, label: string) => void
}

/**
 * Motions brought in from disk — Mixamo exports FBX, the studio writes glTF. Copied into the
 * project's animations folder, so what is chosen downstream is an ordinary catalogue row.
 */
export function CharacterMotionPickerImport({ onChoose }: CharacterMotionPickerImportProps) {
  const { t } = useTranslation()
  const [refused, setRefused] = useState(false)

  const bring = async (): Promise<void> => {
    setRefused(false)
    const bridge = getBridge()
    if (!bridge) return
    const imported = await runTask(i18next.t('activity.importingFiles'), id =>
      bridge.media.importPicked('animations', id),
    )
    if (!imported) {
      await useAssets.getState().refresh()
      return
    }

    reportImportNotices(imported)
    if (imported.assets.length > 0) await useAssets.getState().refresh()
    const { convertArrivedModels } = await import('@/services/meshConversion')
    const assets = await convertArrivedModels(imported.assets)
    // Not awaited, and after the refresh: the shelf shows what came in at once, and each still
    // lands as it is drawn — the pass refreshes again itself and reports its own failures.
    const { generateAnimationThumbnails } = await import('@/services/animationThumbnails')
    void generateAnimationThumbnails(assets)

    const motions = assets.filter(
      asset => asset.type === 'animation' && !needsMeshConversion(asset),
    )
    if (motions.length === 0) {
      const attempted =
        imported.assets.length > 0 || imported.refused.length > 0 || imported.failed.length > 0
      setRefused(attempted)
      return
    }

    const [motion] = motions
    if (motions.length === 1 && motion) {
      onChoose({ kind: 'asset', assetId: motion.id, name: motion.name }, motion.name)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <QuietNote>
        {t('inspector.animationImportHint', { formats: ANIMATION_EXTENSIONS.join(' · ') })}
      </QuietNote>
      <Button onClick={() => void bring()}>{t('inspector.animationImportPick')}</Button>
      {refused && <QuietNote>{t('inspector.animationImportRefused')}</QuietNote>}
    </div>
  )
}

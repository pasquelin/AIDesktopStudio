import { useTranslation } from 'react-i18next'
import { LinkField } from '@/components/LinkField/LinkField'
import type { LinkOption } from '@/components/LinkField/linkOption'
import { urlOfPicture } from '@/hooks/useProjectPictures'
import { openDocumentById } from '@/helpers/openAsset'
import { useSkySource } from '@/stores/skyboxSources'

export type EnvironmentChoiceSkyProps = {
  documentId: string
  options: readonly LinkOption[]
  /** The project's pictures, so the sky shows the one it hangs — held by the parent, not asked twice. */
  pictures: readonly LinkOption[]
  onChange: (documentId: string | null) => void
}

/** The sky DOCUMENT a viewport follows, as the link row a material channel already is. */
export function EnvironmentChoiceSky({
  documentId,
  options,
  pictures,
  onChange,
}: EnvironmentChoiceSkyProps) {
  const { t } = useTranslation()
  // A sky has no picture of its own: what stands for it is the picture it hangs.
  const shown = urlOfPicture(pictures, useSkySource(documentId)?.source?.assetId)

  return (
    <LinkField
      label={t('inspector.sky')}
      scId="scene.skyDocument"
      value={documentId || null}
      options={options}
      valueUrl={shown}
      onChange={onChange}
      emptyLabel={t('inspector.studio')}
      missingLabel={t('inspector.missingSkyDocument')}
      clearLabel={t('inspector.clearSky')}
      clearHint={t('inspector.clearSkyHint')}
      open={{
        label: t('inspector.openSky'),
        hint: t('inspector.openSkyHint'),
        run: () => openDocumentById(documentId),
      }}
    />
  )
}

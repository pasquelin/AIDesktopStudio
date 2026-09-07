import { mdiFolderOpenOutline, mdiMagnify, mdiShapeOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'

type ExplorerEmptyStateProps = {
  searching: boolean
  searchAnswered: boolean
  inDomain: boolean
  domainsLoaded: boolean
  emptyFolder?: boolean
}

export function ExplorerEmptyState({
  searching,
  searchAnswered,
  inDomain,
  domainsLoaded,
  emptyFolder = false,
}: ExplorerEmptyStateProps) {
  const { t } = useTranslation()

  if (emptyFolder) {
    return <EmptyState icon={mdiFolderOpenOutline} message={t('explorer.emptyFolder')} />
  }
  if (searching) {
    return (
      <EmptyState
        icon={mdiMagnify}
        message={searchAnswered ? t('explorer.noMatch') : t('collection.loading')}
      />
    )
  }
  if (inDomain) {
    return (
      <EmptyState
        icon={mdiShapeOutline}
        message={domainsLoaded ? t('explorer.noFiles') : t('collection.loading')}
      />
    )
  }
  return <EmptyState icon={mdiFolderOpenOutline} message={t('explorer.empty')} />
}

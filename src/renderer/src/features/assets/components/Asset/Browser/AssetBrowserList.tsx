import type { ComponentProps, ReactNode } from 'react'
import { mdiImageMultipleOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { Collection } from '@/components/Collection/Collection'
import { CollectionBar } from '@/components/CollectionBar/CollectionBar'
import { EmptyState } from '@/components/EmptyState'
import type { AssetRowModel } from '../rows'

type CollectionProps = ComponentProps<typeof Collection<AssetRowModel>>
type BarProps = ComponentProps<typeof CollectionBar>

type AssetBrowserListProps = {
  collection: BarProps['state']
  onCollectionChange: BarProps['onChange']
  facets: BarProps['facets']
  items: readonly AssetRowModel[]
  selectedIds: readonly string[]
  onSelect: NonNullable<CollectionProps['onSelect']>
  onReachEnd: () => void
  onActivate: (row: AssetRowModel) => void
  renderCard: (row: AssetRowModel) => ReactNode
  expandedId: string | null
  onToggleRow: (row: AssetRowModel) => void
  renderDetail: (row: AssetRowModel) => ReactNode
  renderRow: (row: AssetRowModel) => ReactNode
  emptyMessage: string
  retry?: () => void
}

export function AssetBrowserList(props: AssetBrowserListProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <CollectionBar
        scId="assets"
        state={props.collection}
        onChange={props.onCollectionChange}
        facets={props.facets}
      />
      <Collection
        label={t('panels.assets')}
        multiple
        items={props.items}
        state={props.collection}
        rowHeight="media"
        selectedIds={props.selectedIds}
        onSelect={props.onSelect}
        onReachEnd={props.onReachEnd}
        onActivate={props.onActivate}
        renderCard={props.renderCard}
        expandedId={props.expandedId}
        canOpen={row => row.from === 'remote'}
        onToggleRow={props.onToggleRow}
        renderRowDetail={props.renderDetail}
        renderRow={props.renderRow}
        empty={
          <EmptyState
            icon={mdiImageMultipleOutline}
            message={props.emptyMessage}
            {...(props.retry
              ? {
                  action: {
                    label: t('actions.retry'),
                    hint: t('assets.libraryRefusedHint'),
                    onClick: props.retry,
                  },
                }
              : {})}
          />
        }
      />
    </div>
  )
}
